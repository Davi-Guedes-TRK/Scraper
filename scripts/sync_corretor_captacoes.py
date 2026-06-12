#!/usr/bin/env python3
"""
sync_corretor_captacoes.py — detecta captações via corretor externo no Nido e cria
cards automáticos no Pipefy "COM - Oportunidades".

Captação por corretor = imóvel cadastrado no Nido com:
  - origem_captacao = 'TERCEIROS'
  - relação 'INDICAÇÃO' de um profissional da equipe 'COMERCIAL CORRETORES'
  - situacao = 'Ativo'

Lógica de idempotência: tabela leads_corretor_cards (Supabase) registra quais
codigo_imovel já tiveram card criado. Novas captações = não estão nessa tabela.

Roda on-prem (alcança o dw_trk). Variáveis no .env:
    DW_DATABASE_URL   -> dw_trk (rede local, read-only)
    DATABASE_URL      -> Supabase
    PIPEFY_TOKEN      -> token Bearer do Pipefy
    PIPEFY_PIPE_ID    -> opcional, default 307179010

Uso:
    python sync_corretor_captacoes.py              # últimos 90 dias
    python sync_corretor_captacoes.py --dias 30    # últimos 30 dias
    python sync_corretor_captacoes.py --all        # tudo (cuidado: 273 cards)
    python sync_corretor_captacoes.py --dry-run    # simula sem criar cards
"""

import argparse
import os
import sys
import time

import psycopg2
import psycopg2.extras
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PIPEFY_API  = 'https://api.pipefy.com/graphql'
PIPE_ID     = os.getenv('PIPEFY_PIPE_ID', '307179010')

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
    'terreno': 'Terreno', 'lote': 'Terreno',
    'loja': 'Comercial', 'sala': 'Comercial', 'comercial': 'Comercial',
    'galpão': 'Galpão', 'galpao': 'Galpão',
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
    key = raw.strip().lower()
    return TIPO_MAP.get(key)


# ─── query dw_trk ────────────────────────────────────────────────────────────

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
  i.data_cadastro::date              AS captado_em,
  p_prop.nome                        AS proprietario,
  COALESCE(NULLIF(BTRIM(p_prop.telefone_1), ''),
           NULLIF(BTRIM(p_prop.telefone_2), '')) AS telefone,
  STRING_AGG(DISTINCT p_prof.nome_uso, ', '
    ORDER BY p_prof.nome_uso)        AS corretores,
  NULLIF(i.latitude,  0)             AS lat,
  NULLIF(i.longitude, 0)             AS lng
FROM nido_imoveis i
JOIN nido_imoveis_profissionais ip
  ON ip.codigo_imovel = i.codigo_imovel
 AND ip.relacao = 'INDICAÇÃO'
JOIN nido_profissionais p_prof
  ON p_prof.codigo_profissional = ip.codigo_profissional
 AND p_prof.equipe = 'COMERCIAL CORRETORES'
JOIN nido_pessoas p_prop
  ON p_prop.codigo_pessoa = i.codigo_proprietario
WHERE i.origem_captacao = 'TERCEIROS'
  AND i.situacao        = 'Ativo'
  {filtro_data}
GROUP BY
  i.codigo_imovel, i.tipo_imovel, i.bairro, i.cidade,
  i.logradouro, i.numero, i.complemento,
  i.area_util, i.preco_locacao, i.data_cadastro,
  p_prop.nome, p_prop.telefone_1, p_prop.telefone_2,
  i.latitude, i.longitude
ORDER BY i.data_cadastro DESC
"""

COLS_LEADS = [
    'codigo_imovel', 'tipo_imovel', 'bairro', 'cidade', 'endereco',
    'area_util', 'valor_locacao', 'captado_em',
    'proprietario', 'telefone', 'corretores', 'lat', 'lng',
]

DDL_LEADS = """
CREATE TABLE IF NOT EXISTS public.leads_corretor_aluguel (
  codigo_imovel  text PRIMARY KEY,
  tipo_imovel    text,
  bairro         text,
  cidade         text,
  endereco       text,
  area_util      numeric,
  valor_locacao  numeric,
  captado_em     date,
  proprietario   text,
  telefone       text,
  corretores     text,
  lat            double precision,
  lng            double precision,
  synced_at      timestamptz DEFAULT now()
);
"""

DDL_CARDS = """
CREATE TABLE IF NOT EXISTS public.leads_corretor_cards (
  codigo_imovel  text PRIMARY KEY,
  card_id        text,
  card_url       text,
  criado_em      timestamptz DEFAULT now()
);
"""

# ─── Pipefy ──────────────────────────────────────────────────────────────────

CREATE_CARD = """
mutation CreateCard($input: CreateCardInput!) {
  createCard(input: $input) { card { id title url } }
}
"""


def criar_card(token: str, row: dict, dry_run: bool) -> dict | None:
    """Cria card no Pipefy e retorna {'id', 'title', 'url'}. Retorna None no dry-run."""
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

    origem = f"Corretor: {row['corretores']}" if row['corretores'] else 'Corretor'

    fields = [
        {'field_id': 'endere_o_1',              'field_value': endereco_field},
        {'field_id': 'origem_da_oportunidade_1', 'field_value': origem},
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

    if dry_run:
        print(f"  [dry-run] card seria criado: {titulo_card!r}")
        print(f"            origem={origem!r}  bairro={bairro_norm!r}  tipo={tipo_norm!r}")
        return None

    resp = requests.post(
        PIPEFY_API,
        json={'query': CREATE_CARD, 'variables': {'input': {
            'pipe_id': PIPE_ID,
            'title': titulo_card,
            'fields_attributes': fields,
        }}},
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if errs := data.get('errors'):
        raise RuntimeError('; '.join(e['message'] for e in errs))
    return data['data']['createCard']['card']


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description='Sync captações por corretor → Pipefy')
    ap.add_argument('--dias',    type=int, default=90,
                    help='Processar apenas captações dos últimos N dias (default: 90)')
    ap.add_argument('--all',     action='store_true',
                    help='Processar TODAS as captações ativas (ignora --dias)')
    ap.add_argument('--dry-run', action='store_true',
                    help='Simula sem criar cards no Pipefy')
    args = ap.parse_args()

    dw_url  = os.getenv('DW_DATABASE_URL')
    sb_url  = os.getenv('DATABASE_URL')
    token   = os.getenv('PIPEFY_TOKEN')

    if not dw_url or not sb_url:
        sys.exit('[ERRO] Defina DW_DATABASE_URL e DATABASE_URL no .env')
    if not token and not args.dry_run:
        sys.exit('[ERRO] Defina PIPEFY_TOKEN no .env (ou use --dry-run)')

    filtro = '' if args.all else f"AND i.data_cadastro >= NOW() - INTERVAL '{args.dias} days'"
    query  = QUERY_DW.format(filtro_data=filtro)

    # 1) busca dw_trk
    print(f"[dw_trk] buscando captações por corretor{'  (todas)' if args.all else f' (últimos {args.dias} dias)'}…")
    with psycopg2.connect(dw_url) as dw, dw.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        captacoes = cur.fetchall()
    print(f"[dw_trk] {len(captacoes)} captações encontradas.")

    if not captacoes:
        print('[aviso] nenhuma captação; encerrando.')
        return

    # 2) upsert leads_corretor_aluguel + carrega cards já criados
    with psycopg2.connect(sb_url) as sb:
        with sb.cursor() as cur:
            cur.execute(DDL_LEADS)
            cur.execute(DDL_CARDS)

            # upsert (preserve synced_at dos existentes para não bagunçar timestamps)
            psycopg2.extras.execute_values(cur, f"""
                INSERT INTO public.leads_corretor_aluguel
                  ({', '.join(COLS_LEADS)}, synced_at)
                VALUES %s
                ON CONFLICT (codigo_imovel) DO UPDATE SET
                  tipo_imovel   = EXCLUDED.tipo_imovel,
                  bairro        = EXCLUDED.bairro,
                  cidade        = EXCLUDED.cidade,
                  endereco      = EXCLUDED.endereco,
                  area_util     = EXCLUDED.area_util,
                  valor_locacao = EXCLUDED.valor_locacao,
                  captado_em    = EXCLUDED.captado_em,
                  proprietario  = EXCLUDED.proprietario,
                  telefone      = EXCLUDED.telefone,
                  corretores    = EXCLUDED.corretores,
                  lat           = EXCLUDED.lat,
                  lng           = EXCLUDED.lng,
                  synced_at     = now()
            """, [
                tuple(row[c] for c in COLS_LEADS) + ('now()',)
                for row in captacoes
            ], template="(" + ', '.join(['%s'] * len(COLS_LEADS)) + ", now())")

            # quais já têm card
            cur.execute('SELECT codigo_imovel FROM public.leads_corretor_cards')
            ja_tem_card = {r[0] for r in cur.fetchall()}

        sb.commit()
    print(f'[supabase] leads_corretor_aluguel atualizado. Já com card: {len(ja_tem_card)}.')

    # 3) cria cards para as novas captações
    novas = [r for r in captacoes if r['codigo_imovel'] not in ja_tem_card]
    print(f'[pipefy] {len(novas)} novas captações para criar cards.')

    if not novas:
        print('[pipefy] nada a criar.')
        return

    criados = 0
    erros   = 0
    novos_registros = []

    for row in novas:
        try:
            card = criar_card(token, dict(row), args.dry_run)
            if card:
                novos_registros.append((row['codigo_imovel'], card['id'], card['url']))
                criados += 1
                print(f"  ✓ {row['codigo_imovel']} ({row['bairro']}) → card #{card['id']}")
                time.sleep(0.3)  # evita rate-limit do Pipefy
            else:
                criados += 1  # dry-run conta como "criado"
        except Exception as exc:
            erros += 1
            print(f"  ✗ {row['codigo_imovel']}: {exc}")

    # 4) grava tracking dos cards criados
    if novos_registros and not args.dry_run:
        with psycopg2.connect(sb_url) as sb:
            with sb.cursor() as cur:
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO public.leads_corretor_cards
                      (codigo_imovel, card_id, card_url)
                    VALUES %s
                    ON CONFLICT (codigo_imovel) DO NOTHING
                """, novos_registros)
            sb.commit()
        print(f'[supabase] leads_corretor_cards: {len(novos_registros)} registros gravados.')

    print(f'\n[fim] criados={criados}  erros={erros}  dry_run={args.dry_run}')


if __name__ == '__main__':
    main()
