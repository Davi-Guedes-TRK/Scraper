"""
Captura as OPÇÕES dos selects do form "Portal" (Região/Bairro, Cartório, Finalidade)
usando a sessão salva. Duas fontes: (1) respostas de rede (definição do form),
(2) DOM (abre cada dropdown e lê as opções).

Uso: python scripts/pipefy_form_fields.py
Saída: credentials/pipefy_form_fields.json
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSION_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_session.json"
OUT_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_form_fields.json"
URL = (
    "https://app.pipefy.com/organizations/300542579/interfaces/"
    "288f4973-b7d0-4194-b041-3ee9d19f2e12/pages/"
    "c0a4d373-51ab-4f7b-898e-6285f58b9ada"
    "?form=2a327809-be0b-42fd-ad5e-2762beae97b9&origin=public%20form"
)
WANTED = ["Finalidade", "Cartório", "Cartorio", "Região", "Regiao", "Bairro", "Empresa", "Solicitante"]

def main():
    if not SESSION_FILE.exists():
        print(f"[ERRO] Sessão não encontrada em {SESSION_FILE}."); sys.exit(1)

    net_hits = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(storage_state=str(SESSION_FILE), viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        def on_resp(resp):
            u = resp.url
            if "graphql" not in u and "/api" not in u:
                return
            try:
                body = resp.json()
            except Exception:
                return
            s = json.dumps(body, ensure_ascii=False)
            if any(w in s for w in WANTED):
                net_hits.append({"url": u, "body": body})
        page.on("response", on_resp)

        print("[*] Abrindo form com a sessão salva...")
        page.goto(URL, timeout=45000)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(4)
        if "/login" in page.url or "app-auth" in page.url:
            print(f"[ERRO] Sessão expirada -> {page.url}. Rode pipefy_auth_setup.py"); browser.close(); sys.exit(2)

        # ---- 2) DOM: abre cada dropdown e lê as opções ----
        dom_options = {}
        for campo in ["Região/Bairro", "Cartório", "Finalidade"]:
            try:
                # acha o label e sobe pro container do campo
                lbl = page.query_selector(f"text=/{campo.split('/')[0]}/i")
                if not lbl:
                    dom_options[campo] = "(label não encontrado)"; continue
                # clica no controle perto do label
                handle = lbl
                control = handle.evaluate_handle("el => el.closest('[data-testid],div')")
                lbl.click()
                time.sleep(1.2)
                opts = []
                for o in page.query_selector_all("[role='option'], [role='menuitem'], li[role], [data-testid*='option']"):
                    try:
                        t = (o.inner_text() or "").strip()
                        if t and t not in opts:
                            opts.append(t)
                    except Exception:
                        pass
                dom_options[campo] = opts[:60]
                page.keyboard.press("Escape")
                time.sleep(0.4)
            except Exception as e:
                dom_options[campo] = f"(erro: {e})"

        OUT_FILE.write_text(json.dumps({"network_hits": net_hits, "dom_options": dom_options}, indent=2, ensure_ascii=False, default=str))

        print("\n==== OPÇÕES VIA DOM ====")
        for k, v in dom_options.items():
            print(f"\n[{k}]"); print("  ", v)
        print(f"\n[*] {len(net_hits)} respostas de rede com campos do form salvas.")
        print(f"[*] Tudo em: {OUT_FILE}")
        browser.close()

if __name__ == "__main__":
    main()
