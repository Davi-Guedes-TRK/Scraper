#!/usr/bin/env python3
"""Sync completo de cards do Pipefy → pipefy_captacoes via /api/pipefy.

Variáveis de ambiente:
  PIPEFY_TOKEN    Token pessoal da API do Pipefy
  PIPEFY_PIPE_ID  ID do pipe de captação
  NEXT_API_URL    URL base do Next.js (ex: https://erp-trk.vercel.app)
  SCRAPER_API_KEY Chave de autenticação do endpoint
"""

import os
import re
import logging
from datetime import datetime, timezone
from typing import Any

import requests
import psycopg2
from psycopg2 import sql as pgsql

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

PIPEFY_API = 'https://api.pipefy.com/graphql'

CARDS_QUERY = '''
query SyncCards($pipe_id: ID!, $cursor: String) {
  cards(pipe_id: $pipe_id, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        current_phase { name }
        labels { name }
        due_date
        created_at
        updated_at
        finished_at
        expired
        assignees { name }
        createdBy { name }
        fields {
          field { label }
          value
          date_value
          datetime_value
          float_value
          array_value
        }
        phases_history {
          phase { name }
          firstTimeIn
          lastTimeOut
          duration
        }
      }
    }
  }
}
'''

FIELD_MAP: dict[str, tuple[str, str]] = {
    'Bairro':                               ('bairro',                   'str'),
    'Localização':                          ('localizacao',              'str'),
    'Endereço do Imóvel':                   ('endereco_imovel',          'str'),
    'Links de anúncio':                     ('links_anuncio',            'str'),
    'Valor de anúncio':                     ('valor_anuncio',            'money'),
    'Nome do Proprietário':                 ('nome_proprietario',        'str'),
    'Telefone de Contato':                  ('telefone_contato',         'str'),
    'Outros contatos':                      ('outros_contatos',          'str'),
    'E-mail':                               ('email',                    'str'),
    'Início do levantamento':               ('inicio_levantamento',      'date'),
    'Tipo de Imóvel':                       ('tipo_imovel',              'str'),
    'Valor de Locação Desejado':            ('valor_locacao_desejado',   'str'),
    'Status da Captação':                   ('status_captacao',          'str'),
    'Checklist':                            ('checklist',                'str'),
    'Código da FAC':                        ('codigo_fac',               'str'),
    'Código do Imóvel':                     ('codigo_imovel',            'str'),
    'Solicitar Ônus':                       ('solicitar_onus',           'str'),
    'Ônus':                                 ('onus',                     'str'),
    'Data de Contato':                      ('data_contato',             'date'),
    'Observações do Contato':               ('obs_contato',              'str'),
    'Visita agendada':                      ('visita_agendada',          'date'),
    'Observações da Visita':                ('obs_visita',               'str'),
    'Fotos, vídeos e documentos do imóvel': ('fotos_documentos',         'str'),
    'Valor de Avaliação':                   ('valor_avaliacao',          'str'),
    'Avaliação':                            ('avaliacao',                'str'),
    'Data da Captação':                     ('data_captacao',            'date'),
    'Observações da Captação':              ('obs_captacao',             'str'),
    'Contrato de Administração Assinado':   ('contrato_assinado',        'str'),
    'Data de assinatura do contrato':       ('data_assinatura_contrato', 'date'),
    'Motivo Principal da Não Captação':     ('motivo_nao_captacao',      'str'),
    'Observações da Não Captação':          ('obs_nao_captacao',         'str'),
    'Contato validado?':                    ('contato_validado',         'str'),
    'Data em que foi locado':               ('data_locado',              'date'),
    'Motivos secundários':                  ('motivos_secundarios',      'str'),
    'Matricula':                            ('matricula',                'str'),
    'VK - NIDO':                            ('vk_nido',                  'str'),
    'Corretor':                             ('corretor',                 'str'),
    'Endereço completo do imóvel':          ('endereco_completo',        'str'),
    'Meu interesse':                        ('meu_interesse',            'str'),
    'Pessoa de Origem':                     ('pessoa_origem',            'str'),
}

PHASE_MAP: dict[str, str] = {
    'Leads':                    'leads',
    'Em Contato':               'em_contato',
    'Lead Completo':            'lead_completo',
    'Visita ao Imóvel':         'visita',
    'Captação Realizada ?':     'captacao_realizada',
    'Avaliação':                'avaliacao',
    'Fechado Comercialmente':   'fechado',
    'Matricula Solicitada':     'matricula_solicitada',
    'Ônus Solicitada':          'onus_solicitada',
    'Não Captado ?':            'nao_captado',
    'Locado / Retirado':        'locado',
}


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
        resp = requests.post(
            PIPEFY_API,
            json={'query': CARDS_QUERY, 'variables': {'pipe_id': pipe_id, 'cursor': cursor}},
            headers=headers,
            timeout=30,
        )
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
        if not f:
            return None
        return _parse_money(f.get('float_value') or f.get('value'))

    phases = {
        ph['phase']['name']: ph
        for ph in (card.get('phases_history') or [])
        if ph.get('phase')
    }

    def ph_first(phase: str) -> str | None:
        return _ts((phases.get(phase) or {}).get('firstTimeIn'))

    def ph_last(phase: str) -> str | None:
        return _ts((phases.get(phase) or {}).get('lastTimeOut'))

    def ph_days(phase: str) -> float | None:
        ph = phases.get(phase)
        if not ph:
            return None
        d = ph.get('duration')
        if d is not None:
            return round(float(d) / 1440, 2)
        first = _ts(ph.get('firstTimeIn'))
        last = _ts(ph.get('lastTimeOut'))
        if not first:
            return None
        try:
            t0 = datetime.fromisoformat(first)
            t1 = datetime.fromisoformat(last) if last else datetime.now(timezone.utc)
            return round((t1 - t0).total_seconds() / 86400, 2)
        except Exception:
            return None

    row: dict[str, Any] = {
        'card_id':        int(card['id']),
        'titulo':         card.get('title'),
        'fase_atual':     (card.get('current_phase') or {}).get('name'),
        'etiquetas':      ', '.join(l['name'] for l in (card.get('labels') or [])) or None,
        'data_vencimento': card.get('due_date'),
        'criador':        (card.get('createdBy') or {}).get('name'),
        'responsaveis':   ', '.join(a['name'] for a in (card.get('assignees') or [])) or None,
        'finalizado_em':  _ts(card.get('finished_at')),
        'criado_em':      _ts(card.get('created_at')),
        'atualizado_em':  _ts(card.get('updated_at')),
        'vencido':        'Sim' if card.get('expired') else 'Não',
    }

    for label, (col, kind) in FIELD_MAP.items():
        if kind == 'date':
            row[col] = fdate(label)
        elif kind == 'money':
            row[col] = fmoney(label)
        else:
            row[col] = fstr(label)

    for fase_name, prefix in PHASE_MAP.items():
        row[f'{prefix}_entrada'] = ph_first(fase_name)
        row[f'{prefix}_saida']   = ph_last(fase_name)
        row[f'{prefix}_dias']    = ph_days(fase_name)

    return row


def upsert_cards(conn, rows: list[dict]) -> tuple[int, int]:
    if not rows:
        return 0, 0
    cols = list(rows[0].keys())
    q = pgsql.SQL(
        'INSERT INTO public.pipefy_captacoes ({cols}) VALUES ({vals}) '
        'ON CONFLICT (card_id) DO UPDATE SET {updates} '
        'RETURNING (xmax = 0) AS is_insert'
    ).format(
        cols=pgsql.SQL(', ').join(map(pgsql.Identifier, cols)),
        vals=pgsql.SQL(', ').join([pgsql.Placeholder()] * len(cols)),
        updates=pgsql.SQL(', ').join(
            pgsql.SQL('{c} = EXCLUDED.{c}').format(c=pgsql.Identifier(c))
            for c in cols if c != 'card_id'
        ),
    )
    inserted = updated = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(q, [row[c] for c in cols])
            if cur.fetchone()[0]:
                inserted += 1
            else:
                updated += 1
    conn.commit()
    return inserted, updated


def main() -> None:
    token   = os.environ['PIPEFY_TOKEN']
    pipe_id = os.environ['PIPEFY_PIPE_ID']
    db_url  = os.environ['DATABASE_URL']

    log.info(f'Buscando cards do pipe {pipe_id}...')
    cards = fetch_all_cards(token, pipe_id)
    log.info(f'Total: {len(cards)} cards')

    rows = [map_card(c) for c in cards]

    log.info('Conectando ao banco...')
    conn = psycopg2.connect(db_url)
    try:
        ins, upd = upsert_cards(conn, rows)
        log.info(f'Sync concluído — inseridos: {ins}, atualizados: {upd}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
