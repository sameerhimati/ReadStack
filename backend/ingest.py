"""
Module A (ingest): raw URLs -> populated Article objects.

Downloads HTML concurrently (httpx) and extracts body + title with trafilatura.
Fault-tolerant by design: one dead/slow/empty link must never sink the batch —
it's logged and dropped. `tags` and `embedding` are left for module B to fill.
"""
from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlparse

import httpx
import trafilatura

from contracts import Article

logger = logging.getLogger(__name__)

# Auth-walled / API-hostile domains — extraction here is wasted effort, skip them.
_SKIP_DOMAINS = {
    "x.com", "twitter.com", "linkedin.com",
    "instagram.com", "facebook.com", "threads.net",
}

_CONCURRENCY = 8          # cap on simultaneous fetches so 81 URLs don't fetch serially
_TIMEOUT = 20.0
_MIN_TEXT_CHARS = 200     # below this is nav/boilerplate, not an article
# Downstream LLM tasks (tag/embed/lesson) pay per token — cap body length so a
# single giant page can't blow up cost. The lede carries the gist anyway.
_MAX_TEXT_CHARS = 12_000

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _domain(url: str) -> str:
    """Bare registrable host (no port, no leading www)."""
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _should_skip(url: str) -> bool:
    host = _domain(url)
    return any(host == d or host.endswith("." + d) for d in _SKIP_DOMAINS)


def _title_for(html: str, url: str) -> str:
    """Extracted title, or a sensible fallback (domain) when metadata has none."""
    try:
        meta = trafilatura.extract_metadata(html)
        if meta and meta.title:
            return meta.title.strip()
    except Exception:  # metadata parsing is best-effort, never fatal
        pass
    return _domain(url) or url


async def _fetch_one(
    client: httpx.AsyncClient, sem: asyncio.Semaphore, url: str
) -> Article | None:
    """Fetch + extract a single URL. Returns None on any failure or thin content."""
    if _should_skip(url):
        logger.warning("ingest: skip auth-walled domain %s", url)
        return None
    try:
        async with sem:
            resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_recall=True,
        )
        if not text or len(text.strip()) < _MIN_TEXT_CHARS:
            logger.warning("ingest: empty/thin extraction %s", url)
            return None

        return Article(
            url=url,
            title=_title_for(html, url),
            text=text.strip()[:_MAX_TEXT_CHARS],
            tags=[],
            embedding=None,
        )
    except Exception as exc:  # dead link, timeout, non-200, parse error — drop it
        logger.warning("ingest: failed %s (%s)", url, exc)
        return None


async def fetch(urls: list[str]) -> list[Article]:
    """Turn raw URLs into populated Articles, concurrently and fault-tolerantly."""
    sem = asyncio.Semaphore(_CONCURRENCY)
    headers = {"User-Agent": _USER_AGENT}
    async with httpx.AsyncClient(
        headers=headers, follow_redirects=True, timeout=_TIMEOUT
    ) as client:
        results = await asyncio.gather(
            *(_fetch_one(client, sem, url) for url in urls)
        )

    articles = [a for a in results if a is not None]
    logger.info("ingest: %d/%d urls extracted", len(articles), len(urls))
    return articles


if __name__ == "__main__":
    import pathlib

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    _urls_file = pathlib.Path(__file__).parent / "data" / "urls.txt"
    _sample = [
        line.strip()
        for line in _urls_file.read_text().splitlines()
        if line.strip()
    ][:3]

    for art in asyncio.run(fetch(_sample)):
        print(f"- {art.title}  ({len(art.text)} chars)  {art.url}")
