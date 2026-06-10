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

# Anthropic (Claude) is the swappable fallback brain — same router, same tiers,
# different provider. Native Messages API (NOT OpenAI-shaped), so it gets its own
# adapter below. Embeddings are ALWAYS local — Anthropic has no embeddings API.
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_BASE = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")

# Which brain answers chat(). Akamai (OpenAI-compatible: Ollama/vLLM) is the
# headline and auto-wins once its endpoint is set; Claude is the fallback; mock
# otherwise. Explicit MOCK_INFERENCE=1 always wins (offline dev).
if os.getenv("MOCK_INFERENCE", "") == "1":
    PROVIDER = "mock"
elif AKAMAI_BASE:
    PROVIDER = "akamai"
elif ANTHROPIC_KEY:
    PROVIDER = "anthropic"
else:
    PROVIDER = "mock"

MOCK = PROVIDER == "mock"

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

# Two-tier Claude routing (cheap Haiku for volume, Sonnet for what a human
# consumes). STRONG collapses to Sonnet — no Opus tier. Embed unused (local).
ANTHROPIC_MODEL = {
    "weak": os.getenv("ANTHROPIC_MODEL_WEAK", "claude-haiku-4-5"),
    "mid": os.getenv("ANTHROPIC_MODEL_MID", "claude-sonnet-4-6"),
    "strong": os.getenv("ANTHROPIC_MODEL_STRONG", "claude-sonnet-4-6"),
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
    if PROVIDER == "anthropic":
        return await _anthropic_chat(tier, prompt, system, max_tokens, temperature)
    return await _openai_chat(tier, prompt, system, max_tokens, temperature)


async def _openai_chat(tier: str, prompt: str, system: str, max_tokens: int, temperature: float) -> str:
    """OpenAI-compatible endpoint — Akamai-hosted Ollama / vLLM."""
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


async def _anthropic_chat(tier: str, prompt: str, system: str, max_tokens: int, temperature: float) -> str:
    """Native Anthropic Messages API (Claude). Two-tier: Haiku (weak) / Sonnet (mid+strong)."""
    body: dict = {
        "model": ANTHROPIC_MODEL.get(tier, ANTHROPIC_MODEL["weak"]),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    headers = {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    last_err: Exception | None = None
    for _ in range(_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(
                    f"{ANTHROPIC_BASE}/v1/messages", headers=headers, json=body
                )
                r.raise_for_status()
                blocks = r.json().get("content", [])
                return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            last_err = exc
    log.warning("anthropic.chat failed (tier=%s): %s", tier, last_err)
    return ""


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed via the Akamai endpoint when configured; else local (Anthropic has
    no embeddings API, so the Claude/mock paths always embed locally)."""
    if PROVIDER == "akamai" and AKAMAI_BASE:
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
