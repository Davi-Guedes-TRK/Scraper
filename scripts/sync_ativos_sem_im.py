#!/usr/bin/env python3
"""
sync_ativos_sem_im.py — busca imóveis ATIVOS sem IM (sem administração) no dw_trk
e cria cards automáticos no Pipefy "COM - Oportunidades", direto na fase Negociação.

Imóveis ativos que a TRK NÃO administra:
  - situacao = 'Ativo' no Nido
  - SEM codigo_legado do Imobiliar (ex: 'IM1826')
  - SEM característica 'ADMINISTRADORA'

Idempotência: tabela leads_ativos_sem_im_cards (Supabase) registra quais
codigo_imovel já tiveram card criado. Só cria cards novos.

Roda on-prem (alcança o dw_trk). Variáveis no .env:
    DW_DATABASE_URL   -> dw_trk (rede local, read-only)
    DATABASE_URL      -> Supabase
    PIPEFY_TOKEN      -> token Bearer (ou credentials/pipefy_token.txt)
    PIPEFY_PIPE_ID    -> opcional, default 307179010

Uso:
    python sync_ativos_sem_im.py              # cria cards para todos os ativos sem IM
    python sync_ativos_sem_im.py --dry-run    # simula sem criar cards
    python sync_ativos_sem_im.py --limit 10   # limita a 10 cards
"""

import argparse
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PIPEFY_API    = 'https://api.pipefy.com/graphql'
PIPE_ID       = os.getenv('PIPEFY_PIPE_ID', '307179010')
PHASE_NEGOCIACAO = '343289554'   # fase "Negociação" do pipe 307179010

# ─── normalização para o Pipefy ──────────────────────────────────────────────

BAIRRO_MAP = {
    'asa sul': 'Asa Sul', 'asa norte': 'Asa Norte',
    'lago sul': 'Lago Sul', 'lago norte': 'Lago Norte',
    'sudoeste': 'Sudoeste', 'noroeste': 'Noroeste',
    'park way': 'Park Way', 'parkway': 'Park Way',
    'vila planalto': 'Vila Planalto',
    'setor de habitações individuais sul': 'Lago Sul',
    'setor de habitações individuais norte': 'Lago Norte',
    'setor de mansões do lago norte': 'Lago Norte',
    'setor de mansões dom bosco': 'Lago Sul',
}

TIPO_MAP = {
    'apartamento': 'Apartamento', 'apto': 'Apartamento',
    'casa padrão': 'Casa', 'casa': 'Casa', 'sobrado': 'Casa',
    'casa em condominio': 'Casa', 'casa em condomínio': 'Casa',
    'terreno': 'Terreno', 'lote': 'Terreno',
    'loja': 'Loja', 'comercial': 'Sala Comercial',
    'sala': 'Sala Comercial', 'sala comercial': 'Sala Comercial',
    'galpão': 'Galpão', 'galpao': 'Galpão',
    'cobertura': 'Apartamento',
}


def norm_bairro(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower()
    if key in BAIRRO_MAP:
        return BAIRRO_MAP[key]
    for k, v in BAIRRO_MAP.items():
        if k in key:
            return v
    return None


def norm_tipo(raw: str | None) -> str | None:
    if not raw:
        return None
    import unicodedata
    key = unicodedata.normalize('NFD', raw.strip().lower())
    key = ''.join(c for c in key if not unicodedata.combining(c))
    if key in TIPO_MAP:
        return TIPO_MAP[key]
    for k, v in TIPO_MAP.items():
        if k in key or key in k:
            return v
    return None


# ─── query dw_trk: ativos sem IM ─────────────────────────────────────────────

QUERY_DW = """
SELECT
  i.codigo_imovel,
  i.tipo_imovel,
  i.bairro,
  i.cidade,
  NULLIF(BTRIM(CONCAT_WS(' ', i.logradouro,
    NULLIF(i.numero::text, '0'),
    i.complemento)), '')              AS endereco,
  i.area_util,
  i.preco_locacao                    AS valor_locacao,
  i.data_cadastro::date              AS cadastrado_em,
  p.nome                             AS proprietario,
  COALESCE(NULLIF(BTRIM(p.telefone_1), ''),
           NULLIF(BTRIM(p.telefone_2), '')) AS telefone,
  NULLIF(i.latitude,  0)             AS lat,
  NULLIF(i.longitude, 0)             AS lng
FROM nido_imoveis i
JOIN nido_pessoas p ON p.codigo_pessoa = i.codigo_proprietario
WHERE i.situacao = 'Ativo'
  AND i.situacao_detalhe = 'Ativo'
  AND i.preco_locacao > 0
  -- prefixos TRK: VK (Brasília), LK (Adm), GY (Goiânia), CL (Corporativo)
  AND regexp_replace(i.codigo_imovel, '[0-9].*$', '') IN ('VK', 'LK', 'GY', 'CL')
  -- "sem IM": NÃO tem código legado do Imobiliar
  AND (i.codigo_legado IS NULL OR BTRIM(i.codigo_legado) = '')
  -- NÃO tem a característica ADMINISTRADORA
  AND NOT EXISTS (
    SELECT 1 FROM nido_imoveis_caracteristicas c
    WHERE c.codigo_imovel = i.codigo_imovel AND c.descricao = 'ADMINISTRADORA'
  )
ORDER BY i.data_cadastro DESC;
"""

COLS_LEADS = [
    'codigo_imovel', 'tipo_imovel', 'bairro', 'cidade', 'endereco',
    'area_util', 'valor_locacao', 'cadastrado_em',
    'proprietario', 'telefone', 'lat', 'lng',
]

DDL_LEADS = """
CREATE TABLE IF NOT EXISTS public.leads_ativos_sem_im (
  codigo_imovel  text PRIMARY KEY,
  tipo_imovel    text,
  bairro         text,
  cidade         text,
  endereco       text,
  area_util      numeric,
  valor_locacao  numeric,
  cadastrado_em  date,
  proprietario   text,
  telefone       text,
  lat            double precision,
  lng            double precision,
  synced_at      timestamptz DEFAULT now()
);
"""

DDL_CARDS = """
CREATE TABLE IF NOT EXISTS public.leads_ativos_sem_im_cards (
  codigo_imovel  text PRIMARY KEY,
  card_id        text,
  card_url       text,
  criado_em      timestamptz DEFAULT now()
);
"""

# ─── Pipefy: mutations ──────────────────────────────────────────────────────

CREATE_CARD = """
mutation CreateCard($input: CreateCardInput!) {
  createCard(input: $input) { card { id title url } }
}
"""

MOVE_CARD = """
mutation MoveCard($card_id: ID!, $phase_id: ID!) {
  moveCardToPhase(input: { card_id: $card_id, destination_phase_id: $phase_id }) {
    card { id current_phase { name } }
  }
}
"""


def load_token() -> str:
    """Carrega token: primeiro tenta credentials/pipefy_token.txt, depois env."""
    token_file = Path(__file__).parent.parent / 'credentials' / 'pipefy_token.txt'
    if token_file.exists():
        t = token_file.read_text(encoding='utf-8').strip()
        if t:
            return t
    t = os.getenv('PIPEFY_TOKEN')
    if not t:
        raise SystemExit('Sem token: defina PIPEFY_TOKEN ou rode pipefy_token_refresh.py')
    return t


def pipefy_request(token: str, query: str, variables: dict) -> dict:
    """Faz request GraphQL ao Pipefy com tratamento de erro."""
    resp = requests.post(
        PIPEFY_API,
        json={'query': query, 'variables': variables},
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if errs := data.get('errors'):
        raise RuntimeError('; '.join(e['message'] for e in errs))
    return data['data']


def criar_card(token: str, row: dict, dry_run: bool) -> dict | None:
    """Cria card no Pipefy e move para Negociação. Retorna {'id','title','url'} ou None."""
    bairro_norm = norm_bairro(row['bairro'])
    tipo_norm   = norm_tipo(row['tipo_imovel'])

    titulo_card = ' — '.join(filter(None, [
        row['codigo_imovel'],
        bairro_norm or row['bairro'] or '',
        tipo_norm   or row['tipo_imovel'] or '',
    ]))

    endereco_field = ' — '.join(filter(None, [
        row['endereco'] or '',
        bairro_norm or row['bairro'] or '',
    ])) or row['codigo_imovel']

    fields = [
        {'field_id': 'endere_o_1',              'field_value': endereco_field},
        {'field_id': 'origem_da_oportunidade_1', 'field_value': 'Imóveis Intermediados S/ADM'},
        {'field_id': 'tem_cadastro_no_nido',     'field_value': 'Sim'},
    ]
    if row['valor_locacao'] and float(row['valor_locacao']) > 0:
        fields.append({'field_id': 'valor_estimado_1',  'field_value': str(row['valor_locacao'])})
    if row['area_util'] and float(row['area_util']) > 0:
        fields.append({'field_id': 'metragem_tamanho_1', 'field_value': str(row['area_util'])})
    if bairro_norm:
        fields.append({'field_id': 'bairro_1',           'field_value': bairro_norm})
    if tipo_norm:
        fields.append({'field_id': 'tipo_de_im_vel_1',   'field_value': tipo_norm})
    if row['telefone']:
        fields.append({'field_id': 'telefone_contato_1', 'field_value': str(row['telefone'])})
    if row.get('proprietario'):
        fields.append({'field_id': 'nome_do_propriet_rio_1', 'field_value': str(row['proprietario'])})

    if dry_run:
        val = row.get('valor_locacao', '')
        area = row.get('area_util', '')
        end = row.get('endereco', '')
        print(f"  [dry-run] card: {titulo_card!r}")
        print(f"            prop: {row.get('proprietario', '')!r} | tel: {row.get('telefone', '')!r}")
        print(f"            end: {end!r} | bairro: {bairro_norm!r} | tipo: {tipo_norm!r}")
        print(f"            valor: R$ {val} | area: {area} m²")
        print("            " + "-"*40)
        return None

    # 1) Cria o card
    card_data = pipefy_request(token, CREATE_CARD, {
        'input': {
            'pipe_id': PIPE_ID,
            'title': titulo_card,
            'fields_attributes': fields,
        }
    })
    card = card_data['createCard']['card']

    # 2) Move para Negociação
    try:
        pipefy_request(token, MOVE_CARD, {
            'card_id': card['id'],
            'phase_id': PHASE_NEGOCIACAO,
        })
    except Exception as exc:
        print(f"  [!] card #{card['id']} criado mas erro ao mover p/ Negociação: {exc}")

    return card


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description='Sync ativos sem IM → cards Pipefy (Negociação)')
    ap.add_argument('--dry-run', action='store_true',
                    help='Simula sem criar cards no Pipefy')
    ap.add_argument('--limit', type=int, default=None,
                    help='Limita a N cards criados')
    args = ap.parse_args()

    dw_url  = os.getenv('DW_DATABASE_URL')
    sb_url  = os.getenv('DATABASE_URL')

    if not dw_url or not sb_url:
        sys.exit('[ERRO] Defina DW_DATABASE_URL e DATABASE_URL no .env')

    token = load_token()
    if not token and not args.dry_run:
        sys.exit('[ERRO] Defina PIPEFY_TOKEN no .env (ou use --dry-run)')

    # 1) Busca dw_trk
    print('[dw_trk] buscando imóveis ativos sem IM…')
    with psycopg2.connect(dw_url) as dw, dw.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(QUERY_DW)
        imoveis = cur.fetchall()
    print(f'[dw_trk] {len(imoveis)} imóveis ativos sem IM encontrados.')

    if not imoveis:
        print('[aviso] nenhum imóvel; encerrando.')
        return

    # 2) Upsert leads_ativos_sem_im + carrega cards já criados
    with psycopg2.connect(sb_url) as sb:
        with sb.cursor() as cur:
            cur.execute(DDL_LEADS)
            cur.execute(DDL_CARDS)

            insert_sql = f"""
                INSERT INTO public.leads_ativos_sem_im
                  ({', '.join(COLS_LEADS)}, synced_at)
                VALUES %s
                ON CONFLICT (codigo_imovel) DO UPDATE SET
                  tipo_imovel   = EXCLUDED.tipo_imovel,
                  bairro        = EXCLUDED.bairro,
                  cidade        = EXCLUDED.cidade,
                  endereco      = EXCLUDED.endereco,
                  area_util     = EXCLUDED.area_util,
                  valor_locacao = EXCLUDED.valor_locacao,
                  cadastrado_em = EXCLUDED.cadastrado_em,
                  proprietario  = EXCLUDED.proprietario,
                  telefone      = EXCLUDED.telefone,
                  lat           = EXCLUDED.lat,
                  lng           = EXCLUDED.lng,
                  synced_at     = now()
            """
            tpl = "(" + ', '.join(['%s'] * len(COLS_LEADS)) + ", now())"
            vals = [tuple(row[c] for c in COLS_LEADS) for row in imoveis]
            psycopg2.extras.execute_values(cur, insert_sql, vals, template=tpl)

            # quais já têm card
            cur.execute('SELECT codigo_imovel FROM public.leads_ativos_sem_im_cards')
            ja_tem_card = {r[0] for r in cur.fetchall()}

        sb.commit()
    print(f'[supabase] leads_ativos_sem_im atualizado ({len(imoveis)} linhas). Já com card: {len(ja_tem_card)}.')

    # 3) Filtra novos (sem card)
    novos = [r for r in imoveis if r['codigo_imovel'] not in ja_tem_card]
    if args.limit:
        novos = novos[:args.limit]
    print(f'[pipefy] {len(novos)} novos imóveis para criar cards (fase Negociação).')

    if not novos:
        print('[pipefy] nada a criar — todos já possuem card.')
        return

    # Lista prévia
    for i, r in enumerate(novos):
        print(f"   {i+1:>3}. {r['codigo_imovel']:<10} | {r['bairro'] or '?':<15} | {r['proprietario'] or '?'}")

    # 4) Cria cards
    criados = 0
    erros   = 0
    novos_registros = []

    for row in novos:
        try:
            card = criar_card(token, dict(row), args.dry_run)
            if card:
                novos_registros.append((row['codigo_imovel'], card['id'], card['url']))
                criados += 1
                print(f"  [OK] {row['codigo_imovel']} ({row['bairro']}) -> card #{card['id']}  [Negociacao]")
                time.sleep(0.4)  # rate-limit do Pipefy
            else:
                criados += 1  # dry-run
        except Exception as exc:
            erros += 1
            print(f"  [ERRO] {row['codigo_imovel']}: {exc}")

    # 5) Grava tracking dos cards criados
    if novos_registros and not args.dry_run:
        with psycopg2.connect(sb_url) as sb:
            with sb.cursor() as cur:
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO public.leads_ativos_sem_im_cards
                      (codigo_imovel, card_id, card_url)
                    VALUES %s
                    ON CONFLICT (codigo_imovel) DO NOTHING
                """, novos_registros)
            sb.commit()
        print(f'[supabase] leads_ativos_sem_im_cards: {len(novos_registros)} registros gravados.')

    print(f'\n[fim] criados={criados}  erros={erros}  dry_run={args.dry_run}')


if __name__ == '__main__':
    main()
