"""
Probe do FORMULÁRIO público do Pipefy usando a sessão salva (sem API).
Abre a URL do form com credentials/pipefy_session.json e lê o NOME do form + os campos.

Uso: python scripts/pipefy_form_probe.py [url_do_form]
Requer: credentials/pipefy_session.json (gerado por pipefy_auth_setup.py)
Saída: credentials/pipefy_form_capture.json
"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

SESSION_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_session.json"
OUT_FILE = Path(__file__).parent.parent / "credentials" / "pipefy_form_capture.json"
DEFAULT_URL = (
    "https://app.pipefy.com/organizations/300542579/interfaces/"
    "288f4973-b7d0-4194-b041-3ee9d19f2e12/pages/"
    "c0a4d373-51ab-4f7b-898e-6285f58b9ada"
    "?form=2a327809-be0b-42fd-ad5e-2762beae97b9&origin=public%20form"
)

def first_text(page, selectors):
    for sel in selectors:
        try:
            el = page.query_selector(sel)
            if el:
                t = (el.inner_text() or "").strip()
                if t:
                    return t, sel
        except Exception:
            pass
    return None, None

def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    if not SESSION_FILE.exists():
        print(f"[ERRO] Sessão não encontrada em {SESSION_FILE}. Rode pipefy_auth_setup.py primeiro.")
        sys.exit(1)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(storage_state=str(SESSION_FILE), viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        print(f"[*] Abrindo form com a sessão salva...")
        page.goto(url, timeout=45000)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        time.sleep(4)  # SPA: deixa os campos renderizarem

        if "/login" in page.url or "app-auth.pipefy.com" in page.url:
            print(f"[ERRO] Redirecionou para login -> sessão EXPIRADA. URL: {page.url}")
            print("       Rode: python scripts/pipefy_auth_setup.py")
            browser.close()
            sys.exit(2)

        # NOME do formulário
        form_name, name_sel = first_text(page, [
            "form h1", "form h2", "[data-testid*='title']", "[data-testid*='Title']",
            "main h1", "main h2", "h1", "h2", "[role='heading']",
        ])
        page_title = page.title()

        # Campos: labels + placeholders
        labels = []
        for el in page.query_selector_all("label, [data-testid*='field'] [class*='label'], legend"):
            try:
                t = (el.inner_text() or "").strip()
                if t and t not in labels:
                    labels.append(t)
            except Exception:
                pass

        placeholders = []
        for el in page.query_selector_all("input[placeholder], textarea[placeholder]"):
            try:
                p = (el.get_attribute("placeholder") or "").strip()
                if p and p not in placeholders:
                    placeholders.append(p)
            except Exception:
                pass

        buttons = []
        for el in page.query_selector_all("button"):
            try:
                t = (el.inner_text() or "").strip()
                if t and t not in buttons:
                    buttons.append(t)
            except Exception:
                pass

        print("\n" + "=" * 60)
        print(f"NOME DO FORMULÁRIO: {form_name!r}   (via {name_sel})")
        print(f"<title> da página : {page_title!r}")
        print(f"URL final         : {page.url}")
        print("=" * 60)
        print(f"\nLABELS ({len(labels)}):")
        for l in labels:
            print(f"  - {l}")
        print(f"\nPLACEHOLDERS ({len(placeholders)}):")
        for p in placeholders:
            print(f"  - {p}")
        print(f"\nBOTÕES: {buttons}")

        OUT_FILE.write_text(json.dumps({
            "url": url, "final_url": page.url, "page_title": page_title,
            "form_name": form_name, "labels": labels,
            "placeholders": placeholders, "buttons": buttons,
        }, indent=2, ensure_ascii=False))
        print(f"\n[*] Captura salva em: {OUT_FILE}")
        browser.close()

if __name__ == "__main__":
    main()
