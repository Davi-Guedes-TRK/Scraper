"""
Utilitário de perceptual hash (pHash) para fotos de anúncios.

Ideia: a mesma foto recomprimida/redimensionada por portais diferentes gera
hashes PRÓXIMOS (distância de Hamming pequena), ao contrário de MD5/SHA que
mudam por completo. É o sinal que mais "atravessa" portais para identificar o
mesmo imóvel mesmo quando preço/título/telefone diferem.

Requer: Pillow, imagehash, curl_cffi (cai para requests se não houver).
"""
from __future__ import annotations
import io
import logging
from urllib.parse import urlparse

log = logging.getLogger(__name__)

# Referer por host de CDN — alguns bloqueiam download sem referer do portal.
_REFERER = {
    "dfimoveis.com.br": "https://www.dfimoveis.com.br/",
    "olx.com.br":       "https://www.olx.com.br/",
    "olxcdn.com":       "https://www.olx.com.br/",
    "olxbr.com":        "https://www.olx.com.br/",
    "wimoveis.com.br":  "https://www.wimoveis.com.br/",
    "zap.com.br":       "https://www.zapimoveis.com.br/",
    "vivareal.com.br":  "https://www.vivareal.com.br/",
}


def _referer(host: str) -> str:
    for dominio, ref in _REFERER.items():
        if host.endswith(dominio):
            return ref
    return f"https://{host}/"


_KIND = None
_SESSION = None


def _session():
    """Sessão reutilizável. Prefere curl_cffi (bypass TLS) e cai para requests."""
    global _KIND, _SESSION
    if _SESSION is None:
        try:
            from curl_cffi import requests as cr
            _KIND, _SESSION = "curl", cr.Session(impersonate="chrome124")
        except Exception:
            import requests
            _KIND, _SESSION = "req", requests.Session()
    return _KIND, _SESSION


def _download(url: str, timeout: int = 10) -> bytes | None:
    host = urlparse(url).hostname or ""
    headers = {
        "Referer": _referer(host),
        "User-Agent": "Mozilla/5.0 (compatible; TRK/1.0)",
    }
    _, s = _session()
    try:
        r = s.get(url, headers=headers, timeout=timeout)
        if getattr(r, "status_code", 0) == 200 and r.content:
            return r.content
        log.debug("download status %s em %s", getattr(r, "status_code", "?"), url)
    except Exception as e:  # noqa: BLE001
        log.debug("download falhou %s: %s", url, e)
    return None


def phash_one(url: str) -> str | None:
    import imagehash
    from PIL import Image
    data = _download(url)
    if not data:
        return None
    try:
        with Image.open(io.BytesIO(data)) as im:
            return str(imagehash.phash(im.convert("RGB")))
    except Exception as e:  # noqa: BLE001
        log.debug("phash falhou %s: %s", url, e)
        return None


def split_imagens(imagens) -> list[str]:
    """Campo `imagens` do banco: URLs separadas por vírgula (às vezes \\n)."""
    if not imagens:
        return []
    urls: list[str] = []
    for chunk in str(imagens).split(","):
        for u in chunk.split("\n"):
            u = u.strip()
            if u.startswith("http"):
                urls.append(u)
    return urls


def compute_phashes(imagens, max_imgs: int = 3) -> list[str]:
    """Baixa até `max_imgs` fotos do anúncio e devolve os pHash (hex) obtidos."""
    hashes: list[str] = []
    for u in split_imagens(imagens)[:max_imgs]:
        h = phash_one(u)
        if h:
            hashes.append(h)
    return hashes


def hamming(a: str, b: str) -> int:
    import imagehash
    return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)


def best_distance(hashes_a: list[str], hashes_b: list[str]) -> int:
    """Menor distância de Hamming entre qualquer par de fotos dos dois anúncios."""
    if not hashes_a or not hashes_b:
        return 999
    return min(hamming(a, b) for a in hashes_a for b in hashes_b)


def count_close(hashes_a: list[str], hashes_b: list[str], threshold: int) -> int:
    """Quantos pares de fotos estão dentro do threshold (>=2 fortalece o match)."""
    if not hashes_a or not hashes_b:
        return 0
    return sum(1 for a in hashes_a for b in hashes_b if hamming(a, b) <= threshold)
