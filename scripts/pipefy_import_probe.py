"""
Sonda: abre o Importer do Pipefy com sessão salva, captura os endpoints usados.
Uso: python scripts/pipefy_import_probe.py

Requer: credentials/pipefy_session.json (gerado pelo pipefy_auth_setup.py)
Requer: um arquivo CSV de teste em /tmp/test_import.csv
"""
import json, time, os
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSION_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_session.json"
PIPE_ID = 307179010

captured_requests = []
captured_responses = []

def main():
    if not SESSION_FILE.exists():
        print(f"[ERRO] Sessão não encontrada. Rode pipefy_auth_setup.py primeiro.")
        return

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, args=["--start-maximized"])
        ctx = browser.new_context(
            no_viewport=True,
            storage_state=str(SESSION_FILE),
        )
        page = ctx.new_page()

        # Capture all requests related to import
        def on_req(req):
            url = req.url
            if any(k in url for k in ("import", "graphql", "upload", "pipefy")):
                entry = {
                    "method": req.method,
                    "url": url,
                    "headers": dict(req.headers),
                    "post_data": req.post_data,
                }
                captured_requests.append(entry)
                print(f"[REQ] {req.method} {url[:100]}")
                if req.post_data and len(req.post_data) < 2000:
                    print(f"  body: {req.post_data[:500]}")

        def on_resp(resp):
            url = resp.url
            if any(k in url for k in ("import", "graphql", "upload")):
                try:
                    body = resp.json()
                    entry = {"url": url, "status": resp.status, "body": body}
                    captured_responses.append(entry)
                    print(f"[RESP] {resp.status} {url[:80]}")
                    body_str = json.dumps(body, ensure_ascii=False)
                    if len(body_str) < 1000:
                        print(f"  {body_str[:500]}")
                except Exception:
                    pass

        page.on("request", on_req)
        page.on("response", on_resp)

        print(f"[*] Abrindo pipe {PIPE_ID} com sessão salva...")
        page.goto(f"https://app.pipefy.com/pipes/{PIPE_ID}", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=15000)

        # Try to find and click the import button
        print("[*] Procurando botão de importar...")
        time.sleep(2)

        import_btn = (
            page.query_selector("[data-testid*='import']")
            or page.query_selector("button:has-text('Importar')")
            or page.query_selector("button:has-text('Import')")
            or page.query_selector("[aria-label*='import' i]")
            or page.query_selector("[title*='import' i]")
        )
        if import_btn:
            print("[*] Botão de importar encontrado! Clicando...")
            import_btn.click()
            time.sleep(3)
        else:
            print("[*] Botão não encontrado automaticamente.")
            print("[*] Abra o Importer manualmente no pipe e faça um upload de teste.")
            print("    (pode usar qualquer CSV pequeno)")

        input("\n[*] Navegue pelo Importer e pressione ENTER ao terminar...")

        # Save captures
        output = {
            "requests": captured_requests,
            "responses": captured_responses,
        }
        out_file = Path(__file__).parent.parent / "credentials" / "pipefy_import_capture.json"
        out_file.write_text(json.dumps(output, indent=2, ensure_ascii=False, default=str))
        print(f"\n[*] Captura salva em: {out_file}")
        print(f"[*] {len(captured_requests)} requests | {len(captured_responses)} responses capturadas")

        browser.close()

if __name__ == "__main__":
    main()
