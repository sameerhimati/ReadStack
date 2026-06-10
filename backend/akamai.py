"""Thin Akamai AI Inference Cloud client. One place to map tier -> model.

Two escape hatches so the pipeline runs before the vLLM endpoint is live:
  * MOCK_INFERENCE=1 (or no AKAMAI_INFERENCE_URL set) -> chat() returns a short
    deterministic stub instead of calling the network. The routing metric is
    still real because tasks.py calls route() regardless of this flag.
  * embeddings fall back to a local sentence-transformers model whenever Akamai
    isn't reachable, so clustering always has real vectors to work with.
"""
from __future__ import annotations

import os

import httpx

AKAMAI_BASE = os.getenv("AKAMAI_INFERENCE_URL", "")  # set from hackathon creds
AKAMAI_KEY = os.getenv("AKAMAI_API_KEY", "")

# Mock when explicitly asked, or whenever we have no endpoint to call.
MOCK = os.getenv("MOCK_INFERENCE", "") == "1" or not AKAMAI_BASE

# tier -> model id. Swap for whatever Akamai actually exposes at the event.
MODEL = {
    "weak": "llama-3.1-8b-instruct",
    "mid": "llama-3.3-70b-instruct",
    "strong": "llama-3.1-405b-instruct",   # or a frontier escalation
    "embed": "bge-large-en-v1.5",
}

# Local fallback embedder (384-dim, fast). Lazily loaded so importing this
# module stays cheap and we never pull torch unless embeddings are needed.
_LOCAL_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_local_embedder = None


async def chat(tier: str, prompt: str, system: str = "") -> str:
    if MOCK:
        return _mock_chat(tier, prompt, system)
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{AKAMAI_BASE}/v1/chat/completions",
            headers={"Authorization": f"Bearer {AKAMAI_KEY}"},
            json={"model": MODEL[tier], "messages": messages},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed via Akamai; fall back to a local model if it's unreachable."""
    if not MOCK:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(
                    f"{AKAMAI_BASE}/v1/embeddings",
                    headers={"Authorization": f"Bearer {AKAMAI_KEY}"},
                    json={"model": MODEL["embed"], "input": texts},
                )
                r.raise_for_status()
                return [d["embedding"] for d in r.json()["data"]]
        except (httpx.HTTPError, KeyError):
            pass  # fall through to local
    return _local_embed(texts)


def _local_embed(texts: list[str]) -> list[list[float]]:
    global _local_embedder
    if _local_embedder is None:
        from sentence_transformers import SentenceTransformer

        _local_embedder = SentenceTransformer(_LOCAL_EMBED_MODEL)
    vecs = _local_embedder.encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in vecs]


def _mock_chat(tier: str, prompt: str, system: str = "") -> str:
    """Deterministic stand-in so the pipeline runs without an endpoint.

    Kept intentionally dumb — tasks.py owns the real prompt/parse logic and has
    its own mock path for structured outputs; this only exists so a stray chat()
    call never explodes when creds are absent.
    """
    head = prompt.strip().splitlines()[0][:80] if prompt.strip() else ""
    return f"[mock:{tier}] {head}"
