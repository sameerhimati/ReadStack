"""Thin Akamai AI Inference Cloud client. One place to map tier -> model."""
import os

import httpx

AKAMAI_BASE = os.getenv("AKAMAI_INFERENCE_URL", "")  # set from hackathon creds
AKAMAI_KEY = os.getenv("AKAMAI_API_KEY", "")

# tier -> model id. Swap for whatever Akamai actually exposes at the event.
MODEL = {
    "weak": "llama-3.1-8b-instruct",
    "mid": "llama-3.3-70b-instruct",
    "strong": "llama-3.1-405b-instruct",   # or a frontier escalation
    "embed": "bge-large-en-v1.5",
}


async def chat(tier: str, prompt: str, system: str = "") -> str:
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
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{AKAMAI_BASE}/v1/embeddings",
            headers={"Authorization": f"Bearer {AKAMAI_KEY}"},
            json={"model": MODEL["embed"], "input": texts},
        )
        r.raise_for_status()
        return [d["embedding"] for d in r.json()["data"]]
