"""Thin Akamai AI Inference Cloud client. One place to map tier -> model.

Two escape hatches so the pipeline runs before the vLLM endpoint is live:
  * MOCK_INFERENCE=1 (or no AKAMAI_INFERENCE_URL set) -> chat() returns a short
    deterministic stub instead of calling the network. The routing metric is
    still real because tasks.py calls route() regardless of this flag.
  * embeddings fall back to a local sentence-transformers model whenever Akamai
    isn't reachable, so clustering always has real vectors to work with.
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)

AKAMAI_BASE = os.getenv("AKAMAI_INFERENCE_URL", "")  # set from hackathon creds
AKAMAI_KEY = os.getenv("AKAMAI_API_KEY", "")

# Mock when explicitly asked, or whenever we have no endpoint to call.
MOCK = os.getenv("MOCK_INFERENCE", "") == "1" or not AKAMAI_BASE

# tier -> model id. Overridable by env so going live is a config flip, not a code
# edit: at the event just export AKAMAI_MODEL_WEAK=... to match what vLLM serves.
# (For a one-GPU demo it's fine to point every tier at the same 8B — route() still
# records the tier decisions, so the savings metric stays honest.)
MODEL = {
    "weak": os.getenv("AKAMAI_MODEL_WEAK", "llama-3.1-8b-instruct"),
    "mid": os.getenv("AKAMAI_MODEL_MID", "llama-3.3-70b-instruct"),
    "strong": os.getenv("AKAMAI_MODEL_STRONG", "llama-3.1-405b-instruct"),
    "embed": os.getenv("AKAMAI_MODEL_EMBED", "bge-large-en-v1.5"),
}

# Bound every call: cap output (latency + cost — a runaway generation can't stall
# a page build) and give a flaky endpoint one retry before degrading gracefully.
_TIMEOUT = float(os.getenv("AKAMAI_TIMEOUT", "45"))
_RETRIES = int(os.getenv("AKAMAI_RETRIES", "1"))

# Local fallback embedder (384-dim, fast). Lazily loaded so importing this
# module stays cheap and we never pull torch unless embeddings are needed.
_LOCAL_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_local_embedder = None


async def chat(
    tier: str,
    prompt: str,
    system: str = "",
    *,
    max_tokens: int = 600,
    temperature: float = 0.3,
) -> str:
    """One OpenAI-compatible chat call. Bounded output, one retry, then degrade.

    On final failure returns "" rather than raising, so a single flaky call can't
    abort a whole pipeline build — the caller's parse handles the empty string.
    """
    if MOCK:
        return _mock_chat(tier, prompt, system)
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    payload = {
        "model": MODEL[tier],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    last_err: Exception | None = None
    for _ in range(_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(
                    f"{AKAMAI_BASE}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {AKAMAI_KEY}"},
                    json=payload,
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            last_err = exc
    log.warning("akamai.chat failed (tier=%s): %s", tier, last_err)
    return ""


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
