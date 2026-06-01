"""
Setup único: faz login no Pipefy via browser, salva a sessão em arquivo.
Uso: python scripts/pipefy_auth_setup.py

Após rodar uma vez, a sessão fica salva em credentials/pipefy_session.json
e pode ser reutilizada sem login por semanas/meses.
"""
import json, time, os, sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSION_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_session.json"
PIPE_ID = 307179010

def capture_token(page) -> str | None:
    tokens = []
    def on_req(req):
        auth = req.headers.get("authorization", "")
        if auth.startswith("Bearer ") and len(auth) > 100:
            t = auth[7:]
            if t not in tokens:
                tokens.append(t)
    page.on("request", on_req)
    return tokens

def main():
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, args=["--start-maximized"])
        ctx = browser.new_context(no_viewport=True)
        page = ctx.new_page()

        tokens = capture_token(page)

        print(f"[*] Abrindo Pipefy...")
        page.goto("https://app.pipefy.com/login", timeout=30000)

        print("[*] Faça login com Google. Aguardando...")
        # Wait until redirected away from /login (organizations, pipes, home, etc.)
        page.wait_for_url(
            re.compile(r"app\.pipefy\.com/(?!login)"),
            timeout=180000,
        )
        print("[*] Login detectado! URL:", page.url)
        time.sleep(3)

        # Navigate to target pipe to trigger graphql calls and confirm access
        print(f"[*] Navegando para pipe {PIPE_ID}...")
        page.goto(f"https://app.pipefy.com/pipes/{PIPE_ID}", timeout=30000)
        try:
            page.wait_for_load_state("domcontentloaded", timeout=10000)
        except Exception:
            pass
        time.sleep(3)

        # Save session state (cookies + localStorage)
        ctx.storage_state(path=str(SESSION_FILE))
        print(f"[*] Sessão salva em: {SESSION_FILE}")

        if tokens:
            # Save token separately for direct API use
            token_file = SESSION_FILE.parent / "pipefy_token.txt"
            token_file.write_text(tokens[-1])
            print(f"[*] Token Bearer salvo em: {token_file}")
            print(f"[*] Token: {tokens[-1][:40]}...")

        print("[*] Pronto! Pode fechar o browser.")
        input("[ENTER para fechar]")
        browser.close()

if __name__ == "__main__":
    main()
