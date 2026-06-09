"""TEMPORÁRIO — dry-run AMPLO de dedup (OLX+DF+FB inteiros). READ-ONLY.
Cacheia hashes em .cache_phash.json e escreve relatório em _dryrun_result.txt (UTF-8).
"""
import os, re, sys, json, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg2
from psycopg2.extras import RealDictCursor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from phash_util import compute_phashes, best_distance, count_close

TABLES = ["imoveis_olx", "imoveis_dfimoveis", "imoveis_facebook"]
STRONG, THRESHOLD = 4, 8
CACHE = os.path.join(HERE, ".cache_phash.json")
OUT = os.path.join(HERE, "_dryrun_result.txt")

lines = []
def emit(s=""):
    print(s, flush=True)
    lines.append(s)

def norm(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def advertiser(r):
    creci = norm(r.get("creci"))
    if creci: return "creci:" + creci
    nome = (r.get("nome_anunciante") or "").strip().lower()
    if nome: return "nome:" + nome
    tel = re.sub(r"\D", "", r.get("telefone") or "")
    return "tel:" + tel[-11:] if len(tel) >= 10 else None

def is_match(a, b):
    d = best_distance(a["h"], b["h"])
    if d <= STRONG: return True
    return d <= THRESHOLD and count_close(a["h"], b["h"], THRESHOLD) >= 2

class UF:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x: self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[rb] = ra


def main():
    t0 = time.time()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    rows = []
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for t in TABLES:
            cur.execute(f"SELECT to_regclass('public.{t}') ex");
            if not cur.fetchone()["ex"]: continue
            cur.execute(f"""SELECT link, telefone, creci, nome_anunciante, tipo_anunciante,
                                   bairro, cidade, imagens
                            FROM public.{t}
                            WHERE COALESCE(ativo,true) AND imagens IS NOT NULL AND imagens<>''""")
            for r in cur.fetchall():
                r = dict(r); r["portal"] = t.replace("imoveis_", ""); rows.append(r)
    conn.close()
    emit(f"Carregados {len(rows)} anúncios ativos com fotos.")

    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(open(CACHE, encoding="utf-8"))
            emit(f"Cache: {len(cache)} hashes já calculados.")
        except Exception:
            emit("Cache corrompido — recomeçando do zero.")
    todo = [r for r in rows if r["link"] not in cache]
    emit(f"A baixar/hashear: {len(todo)}")

    # Só a thread PRINCIPAL mexe no `cache` e grava em disco; os workers apenas
    # baixam e devolvem os hashes (evita 'dict changed size during iteration').
    if todo:
        with ThreadPoolExecutor(max_workers=16) as ex:
            futs = {ex.submit(compute_phashes, r["imagens"], 3): r["link"] for r in todo}
            for i, fut in enumerate(as_completed(futs), 1):
                try:
                    cache[futs[fut]] = fut.result()
                except Exception:
                    cache[futs[fut]] = []
                if i % 200 == 0:
                    print(f"  ...{i}/{len(todo)} ({time.time()-t0:.0f}s)", flush=True)
                    json.dump(cache, open(CACHE, "w", encoding="utf-8"))
    json.dump(cache, open(CACHE, "w", encoding="utf-8"))

    for r in rows: r["h"] = cache.get(r["link"], [])
    rows = [r for r in rows if r["h"]]
    emit(f"Com >=1 hash válido: {len(rows)} ({time.time()-t0:.0f}s)")

    # bloco por bairro (cidade normalizada)
    blocks = {}
    for i, r in enumerate(rows):
        blocks.setdefault(norm(r.get("cidade")) or norm(r.get("bairro")) or "?", []).append(i)
    uf = UF(len(rows)); comp = 0
    for idxs in blocks.values():
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                comp += 1
                if is_match(rows[idxs[a]], rows[idxs[b]]): uf.union(idxs[a], idxs[b])

    groups = {}
    for i, r in enumerate(rows): groups.setdefault(uf.find(i), []).append(r)
    dups = [g for g in groups.values() if len(g) > 1]
    cross = [g for g in dups if len({r["portal"] for r in g}) > 1]
    sem_excl = [g for g in dups if len({a for a in (advertiser(r) for r in g) if a}) >= 2]

    emit(f"\n===== DRY-RUN AMPLO ({comp} comparações em {len(blocks)} blocos, {time.time()-t0:.0f}s) =====")
    emit(f"grupos com duplicata     : {len(dups)}")
    emit(f"  cross-portal           : {len(cross)}")
    emit(f"  sem exclusividade (>=2) : {len(sem_excl)}")
    emit(f"anúncios que colapsariam : {sum(len(g)-1 for g in dups)} de {len(rows)} ({100*sum(len(g)-1 for g in dups)/max(len(rows),1):.1f}%)")

    # por bairro: onde mais tem cross-portal
    by_bairro = {}
    for g in cross:
        b = norm(g[0].get("cidade")) or "?"
        by_bairro[b] = by_bairro.get(b, 0) + 1
    emit("\nTop bairros por duplicata cross-portal:")
    for b, n in sorted(by_bairro.items(), key=lambda x: -x[1])[:12]:
        emit(f"   {b:24} {n}")

    emit("\nExemplos (maiores grupos cross-portal):")
    for g in sorted(cross, key=len, reverse=True)[:10]:
        ann = sorted({a for a in (advertiser(r) for r in g) if a})
        flag = "  SEM-EXCL" if len(ann) >= 2 else ""
        emit(f"\n[{len(g)}x | {','.join(sorted({r['portal'] for r in g}))} | {len(ann)} anunciante(s)]{flag}")
        for r in g:
            emit(f"   {r['portal']:9} {(r.get('nome_anunciante') or '-')[:20]:20} {r['link'][:75]}")

    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"\nRelatório salvo em {OUT}", flush=True)


if __name__ == "__main__":
    main()
