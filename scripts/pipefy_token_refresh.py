"""
Renova o token Pipefy sem abrir login — usa a sessão salva (pipefy_session.json).
Roda headless. Chamado pelo GitHub Actions a cada 2 dias.

Uso local:  python scripts/pipefy_token_refresh.py
CI:         exige PIPEFY_SESSION_B64 no env (base64 do pipefy_session.json)
"""
import json, time, os, re, sys, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSION_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_session.json"
TOKEN_FILE   = Path(__file__).parent.parent / "credentials" / "pipefy_token.txt"
PIPE_ID      = 307179010

def load_session():
    # CI: decodifica do env
    b64 = os.getenv("PIPEFY_SESSION_B64")
    if b64:
        SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
        SESSION_FILE.write_bytes(base64.b64decode(b64))
        print("[*] Sessão carregada do env PIPEFY_SESSION_B64")
        return
    if not SESSION_FILE.exists():
        print("[ERRO] pipefy_session.json não encontrado. Rode pipefy_auth_setup.py primeiro.")
        sys.exit(1)

def main():
    load_session()

    tokens = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(storage_state=str(SESSION_FILE))
        page = ctx.new_page()

        def on_req(req):
            auth = req.headers.get("authorization", "")
            if auth.startswith("Bearer ") and len(auth) > 100:
                t = auth[7:]
                if t not in tokens:
                    tokens.append(t)

        page.on("request", on_req)

        print(f"[*] Navegando para pipe {PIPE_ID} (headless)...")
        try:
            page.goto(f"https://app.pipefy.com/pipes/{PIPE_ID}", timeout=30000)
            page.wait_for_load_state("domcontentloaded", timeout=10000)
        except Exception:
            pass
        time.sleep(4)

        if not tokens:
            # Tenta navegar para a home para forçar emissão de token
            try:
                page.goto("https://app.pipefy.com", timeout=15000)
                time.sleep(3)
            except Exception:
                pass

        # Atualiza session (SSO cookies podem ter sido renovados)
        ctx.storage_state(path=str(SESSION_FILE))
        browser.close()

    if not tokens:
        print("[ERRO] Nenhum token capturado — sessão provavelmente expirou.")
        print("       Rode pipefy_auth_setup.py para refazer o login.")
        sys.exit(1)

    token = tokens[-1]
    TOKEN_FILE.write_text(token)
    print(f"[OK] Token renovado: {token[:40]}...")

    # Imprime para o CI capturar via step output
    print(f"::set-output name=token::{token}")
    # Também via $GITHUB_OUTPUT se disponível
    gh_out = os.getenv("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"token={token}\n")
        # Salva a nova sessão como base64 para atualizar o secret
        session_b64 = base64.b64encode(SESSION_FILE.read_bytes()).decode()
        with open(gh_out, "a") as f:
            f.write(f"session_b64={session_b64}\n")

if __name__ == "__main__":
    main()
