#!/usr/bin/env python3
"""Sync de cards do pipe de captação (Pipefy) → tabela pipefy_captacoes.

Pipe alvo: "COM - Oportunidades" (307179010). Faz full-refresh (TRUNCATE + load).
Auto-migra as colunas da tabela a partir do FIELD_MAP/PHASE_MAP.

Variáveis:
  PIPEFY_TOKEN    Token (prefere credentials/pipefy_token.txt, renovado pela sessão)
  PIPEFY_PIPE_ID  ID do pipe (default 307179010)
  DATABASE_URL    Supabase
"""

import os
import re
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import psycopg2
from psycopg2 import sql as pgsql

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

PIPEFY_API = 'https://api.pipefy.com/graphql'
DEFAULT_PIPE_ID = '307179010'

CARDS_QUERY = '''
query SyncCards($pipe_id: ID!, $cursor: String) {
  cards(pipe_id: $pipe_id, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id title
        current_phase { name }
        labels { name }
        due_date created_at updated_at finished_at expired
        assignees { name }
        createdBy { name }
        fields { field { label } value date_value datetime_value float_value array_value }
        phases_history { phase { name } firstTimeIn lastTimeOut duration }
      }
    }
  }
}
'''

# Campos do pipe 307179010 → colunas (label EXATO do Pipefy, com acento)
FIELD_MAP: dict[str, tuple[str, str]] = {
    'Endereço':                                    ('endereco',               'str'),
    'Origem da Oportunidade':                      ('origem_oportunidade',    'str'),
    'Metragem/Tamanho':                            ('metragem',               'str'),
    'Link de Localização':                         ('link_localizacao',       'str'),
    'Link de anúncio':                             ('links_anuncio',          'str'),
    'Matrícula':                                   ('matricula',              'str'),
    'Nome do Proprietário':                        ('nome_proprietario',      'str'),
    'Idade':                                       ('idade',                  'str'),
    'Telefone/Contato':                            ('telefone_contato',       'str'),
    'Outros Contatos':                             ('outros_contatos',        'str'),
    'E-mail':                                      ('email',                  'str'),
    'Bairro':                                      ('bairro',                 'str'),
    'Tipo de Imóvel':                              ('tipo_imovel',            'str'),
    'Ônus':                                        ('onus',                   'str'),
    'VK':                                          ('tem_nido',               'str'),
    'Valor Estimado':                              ('valor_estimado',         'money'),
    'Data de Contato':                             ('data_contato',           'date'),
    'Houve abertura do proprietário?':             ('abertura_proprietario',  'str'),
    'Observações':                                 ('observacoes',            'str'),
    'Urgência':                                    ('urgencia',               'str'),
    'Status do Lead':                              ('status_lead',            'str'),
    'Status':                                      ('status',                 'str'),
    'Motivo da não captação':                      ('motivo_nao_captacao',    'str'),
    'Atividades Realizadas':                       ('atividades_realizadas',  'str'),
    'Observações da Visita':                       ('obs_visita',             'str'),
    'Objeções Comerciais Registradas':            ('objecoes_comerciais',    'str'),
    'Oportunidades com contrato de administração': ('contrato_administracao', 'str'),
}

# Fases do funil (na ordem) → prefixo de coluna
PHASE_MAP: dict[str, str] = {
    'Informações Básicas': 'info_basicas',
    'Qualificação':        'qualificacao',
    'Negociação':          'negociacao',
    'Captado':             'captado',
    'Não Captado':         'nao_captado',
}

BASE_COLS: dict[str, str] = {
    'titulo': 'text', 'fase_atual': 'text', 'etiquetas': 'text', 'data_vencimento': 'text',
    'criador': 'text', 'responsaveis': 'text', 'finalizado_em': 'timestamptz',
    'criado_em': 'timestamptz', 'atualizado_em': 'timestamptz', 'vencido': 'text',
    'sincronizado_em': 'timestamptz',
}


def all_columns() -> dict[str, str]:
    cols = dict(BASE_COLS)
    for _, (col, kind) in FIELD_MAP.items():
        cols[col] = 'numeric' if kind == 'money' else 'text'
    for prefix in PHASE_MAP.values():
        cols[f'{prefix}_entrada'] = 'timestamptz'
        cols[f'{prefix}_saida'] = 'timestamptz'
        cols[f'{prefix}_dias'] = 'numeric'
    return cols


def ensure_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute('CREATE TABLE IF NOT EXISTS public.pipefy_captacoes (card_id bigint PRIMARY KEY)')
        for col, typ in all_columns().items():
            cur.execute(f'ALTER TABLE public.pipefy_captacoes ADD COLUMN IF NOT EXISTS "{col}" {typ}')
    conn.commit()


def load_token() -> str:
    for p in (Path(__file__).parent.parent / 'credentials' / 'pipefy_token.txt',):
        if p.exists():
            t = p.read_text().strip()
            if t:
                return t
    t = os.getenv('PIPEFY_TOKEN')
    if not t:
        raise SystemExit('Sem token: defina PIPEFY_TOKEN ou rode pipefy_token_refresh.py')
    return t


def _parse_money(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r'[^\d,.-]', '', str(v))
    s = re.sub(r'\.(?=\d{3}(\D|$))', '', s)
    s = s.replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def _ts(v: str | None) -> str | None:
    if not v:
        return None
    return v.replace('Z', '+00:00') if v.endswith('Z') else v


def fetch_all_cards(token: str, pipe_id: str) -> list[dict]:
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    cards: list[dict] = []
    cursor = None
    while True:
        resp = requests.post(PIPEFY_API, json={'query': CARDS_QUERY, 'variables': {'pipe_id': pipe_id, 'cursor': cursor}}, headers=headers, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        if errs := body.get('errors'):
            raise RuntimeError(f'Pipefy API: {errs}')
        page = body['data']['cards']
        cards.extend(e['node'] for e in page['edges'])
        log.info(f'  {len(cards)} cards carregados...')
        if not page['pageInfo']['hasNextPage']:
            break
        cursor = page['pageInfo']['endCursor']
    return cards


def map_card(card: dict) -> dict[str, Any]:
    fields = {f['field']['label']: f for f in (card.get('fields') or [])}

    def fstr(label: str) -> str | None:
        f = fields.get(label)
        return (f.get('value') or None) if f else None

    def fdate(label: str) -> str | None:
        f = fields.get(label)
        if not f:
            return None
        return f.get('date_value') or f.get('datetime_value') or (f.get('value') or None)

    def fmoney(label: str) -> float | None:
        f = fields.get(label)
        return _parse_money(f.get('float_value') or f.get('value')) if f else None

    phases = {ph['phase']['name']: ph for ph in (card.get('phases_history') or []) if ph.get('phase')}

    def ph_first(p: str) -> str | None:
        return _ts((phases.get(p) or {}).get('firstTimeIn'))

    def ph_last(p: str) -> str | None:
        return _ts((phases.get(p) or {}).get('lastTimeOut'))

    def ph_days(p: str) -> float | None:
        ph = phases.get(p)
        if not ph:
            return None
        d = ph.get('duration')
        if d is not None:
            return round(float(d) / 1440, 2)
        first = _ts(ph.get('firstTimeIn'))
        if not first:
            return None
        try:
            t0 = datetime.fromisoformat(first)
            t1 = datetime.fromisoformat(_ts(ph.get('lastTimeOut'))) if ph.get('lastTimeOut') else datetime.now(timezone.utc)
            return round((t1 - t0).total_seconds() / 86400, 2)
        except Exception:
            return None

    row: dict[str, Any] = {
        'card_id': int(card['id']),
        'titulo': card.get('title'),
        'fase_atual': (card.get('current_phase') or {}).get('name'),
        'etiquetas': ', '.join(l['name'] for l in (card.get('labels') or [])) or None,
        'data_vencimento': card.get('due_date'),
        'criador': (card.get('createdBy') or {}).get('name'),
        'responsaveis': ', '.join(a['name'] for a in (card.get('assignees') or [])) or None,
        'finalizado_em': _ts(card.get('finished_at')),
        'criado_em': _ts(card.get('created_at')),
        'atualizado_em': _ts(card.get('updated_at')),
        'vencido': 'Sim' if card.get('expired') else 'Não',
        'sincronizado_em': datetime.now(timezone.utc).isoformat(),
    }
    for label, (col, kind) in FIELD_MAP.items():
        row[col] = fdate(label) if kind == 'date' else fmoney(label) if kind == 'money' else fstr(label)
    for fase_name, prefix in PHASE_MAP.items():
        row[f'{prefix}_entrada'] = ph_first(fase_name)
        row[f'{prefix}_saida'] = ph_last(fase_name)
        row[f'{prefix}_dias'] = ph_days(fase_name)
    return row


def load_rows(conn, rows: list[dict]) -> int:
    if not rows:
        return 0
    cols = list(rows[0].keys())
    q = pgsql.SQL('INSERT INTO public.pipefy_captacoes ({cols}) VALUES ({vals})').format(
        cols=pgsql.SQL(', ').join(map(pgsql.Identifier, cols)),
        vals=pgsql.SQL(', ').join([pgsql.Placeholder()] * len(cols)),
    )
    with conn.cursor() as cur:
        cur.execute('TRUNCATE public.pipefy_captacoes')
        for row in rows:
            cur.execute(q, [row[c] for c in cols])
    conn.commit()
    return len(rows)


def main() -> None:
    token = load_token()
    pipe_id = os.getenv('PIPEFY_PIPE_ID', DEFAULT_PIPE_ID)
    db_url = os.environ['DATABASE_URL']

    log.info(f'Buscando cards do pipe {pipe_id}...')
    cards = fetch_all_cards(token, pipe_id)
    rows = [map_card(c) for c in cards]
    log.info(f'Total: {len(rows)} cards')

    conn = psycopg2.connect(db_url)
    try:
        ensure_schema(conn)
        n = load_rows(conn, rows)
        log.info(f'Sync concluído — {n} cards carregados (full refresh).')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
