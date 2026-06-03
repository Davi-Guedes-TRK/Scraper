#!/usr/bin/env python3
"""Lista as FASES (ordem + nº de cards) e os CAMPOS de um pipe do Pipefy.

Serve para adaptar o dashboard do funil a um pipe novo, sem chutar a estrutura.
VOCÊ roda (usa a mesma API que o pipefy_sync/CI já usa) — o agente não chama a API.

Uso:
  python scripts/pipefy_probe_pipe.py 1358552275

Lê PIPEFY_TOKEN do ambiente ou de .env / ERP_TRK/.env.local.
"""
import os
import re
import sys
import json
from pathlib import Path

import requests


def env(key: str) -> str | None:
    if os.getenv(key):
        return os.getenv(key)
    for p in ('.env', 'ERP_TRK/.env.local', '.env.local', '../.env'):
        f = Path(p)
        if not f.exists():
            continue
        for line in f.read_bytes().decode('utf-8', 'replace').splitlines():
            m = re.match(rf'^\s*{re.escape(key)}\s*=\s*(.+)$', line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    return None


def main() -> None:
    pipe_id = sys.argv[1] if len(sys.argv) > 1 else env('PIPEFY_PIPE_ID')
    # prefere o token renovado (pipefy_token_refresh) sobre o do .env, que pode estar velho
    token = None
    for tf in (Path('ERP_TRK/credentials/pipefy_token.txt'), Path('credentials/pipefy_token.txt')):
        if tf.exists():
            token = tf.read_text().strip()
            break
    if not token:
        token = env('PIPEFY_TOKEN')
    if not token or not pipe_id:
        sys.exit('Defina PIPEFY_TOKEN (env/.env) e passe o PIPE_ID como argumento.')

    query = (
        '{ pipe(id: "%s") { name '
        'phases { name cards_count fields { label } } '
        'start_form_fields { label } } }' % pipe_id
    )
    r = requests.post(
        'https://api.pipefy.com/graphql',
        json={'query': query},
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        timeout=40,
    )
    data = r.json()
    if data.get('errors'):
        sys.exit('Pipefy: ' + json.dumps(data['errors'], ensure_ascii=False))
    if not isinstance(data, dict) or data.get('data') is None or data['data'].get('pipe') is None:
        print('HTTP', r.status_code)
        print('Resposta crua:', json.dumps(data, ensure_ascii=False)[:1500])
        sys.exit('Sem dados — provável token expirado (rode o refresh) ou pipe inacessível.')

    p = data['data']['pipe']
    print(f"PIPE: {p['name']}  (id {pipe_id})")
    print('\n=== FASES (na ordem do funil) ===')
    for ph in p['phases']:
        print(f"  [{ph['cards_count']:>4} cards]  {ph['name']}")

    seen: set[str] = set()
    labels: list[str] = []
    for fl in (p.get('start_form_fields') or []):
        if fl['label'] not in seen:
            seen.add(fl['label']); labels.append(fl['label'])
    for ph in p['phases']:
        for fl in (ph.get('fields') or []):
            if fl['label'] not in seen:
                seen.add(fl['label']); labels.append(fl['label'])
    print(f"\n=== CAMPOS ({len(labels)}) ===")
    for label in labels:
        print('  -', label)


if __name__ == '__main__':
    main()
