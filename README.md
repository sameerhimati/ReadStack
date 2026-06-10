# ReadStack

Turn your saved-link backlog into something you actually learn from: bite-size
lessons + an auto-built topic graph that webs your reading together.

## The thesis

There's too much to read and too little time to consume it. ReadStack uses
**Akamai-hosted open models to embed, parse, and summarize** your saved articles
— per-article and per-topic — then **Magnific (via its MCP) to turn them into
audio (and video)** you can actually consume. A personal NotebookLM for your
bookmarks.

**The inference choice** (the hackathon point): route the right model to the
right task across Akamai's GPU tiers — cheap 8B for the volume work (tag, embed,
cluster, verify); a stronger model only for what a human consumes; a grounding
pass keeps it faithful. Cheap, grounded, and it scales to a whole backlog.

## The model → task map

| Task | Volume | Tier | Why |
|---|---|---|---|
| Tag / topic extraction | high | weak | simple, cheap, per-article |
| Embeddings | high | embed | drives clustering + graph |
| Cluster naming + split decision | medium | weak | structural |
| Lesson / video script | medium | mid → strong on hero topics | a human consumes it |
| Grounding check | high | weak → strong on low confidence | reliability, every lesson |
| Hard / incoherent cases | low | strong | only when cheap fails |

## Neurosymbolic control layer

`backend/router.py` is the spine. The **symbolic** half = explicit, auditable
rules deciding tier + granularity. The **neural** half = cheap models supplying
the fuzzy signals (coherence, hero-ness, groundedness) the rules act on. The
control flow is readable rules, not an LLM guessing.

## Architecture (modules — built in parallel against `contracts.py`)

- **A — Ingest** `urls[] → Article{url,title,text}` (Readability fetch)
- **B — Inference layer** the router + tasks (tag/embed/cluster/lesson/verify) → Akamai
- **C — Topic structure** embeddings → hierarchical clusters → `TopicNode` tree
- **D — Frontend** (Next.js) reader + topic-graph viz + lesson view + video slot
- **E — Video** (stretch) MoneyPrinterTurbo: script → mp4

## Run

```
cd backend && pip install -r requirements.txt && uvicorn main:app --reload
```

Set `AKAMAI_INFERENCE_URL` and `AKAMAI_API_KEY` from the hackathon credits.
