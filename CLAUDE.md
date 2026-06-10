# ReadStack — Claude Code Project Context

One-day hackathon build (AI Inference Hack Day, sponsored by Akamai AI Inference
Cloud). Solo. The only deliverable that matters today: a **working demo** with a
clear, measurable inference win.

## What this is
Turn a saved-link backlog into bite-size lessons + an auto-built topic graph
that webs your reading together. The **product** is the learning surface; the
**point** (for judging) is the inference choice: route the right model to the
right task so processing a whole backlog is affordable and the output stays
grounded.

## The thesis (say this to judges)
There's too much to read and too little time. We use **Akamai-hosted open models
to embed / parse / summarize** saved articles, then **Magnific (via MCP) to
generate audio (and video)** — a personal NotebookLM for your bookmarks. The
inference choice: **route the right model to the right task across Akamai's GPU
tiers** — cheap 8B for the volume work, stronger only for what a human consumes,
grounded throughout. Cheap, grounded, scales to a whole backlog.

## Stack
- **Backend:** Python / FastAPI — the pipeline + the neurosymbolic router
- **Frontend:** Next.js (App Router) + Tailwind — reader + topic graph + lessons
- **Inference:** Akamai AI Inference Cloud (open models, tiered)
- **Audio/Video:** Magnific (Freepik) via MCP — audio (definite), video (stretch). Fronts the best voice/image/video models (ElevenLabs, Grok, etc.)

## Structure
```
backend/contracts.py  shared types — ALL modules code against these
backend/router.py     neurosymbolic policy (route + should_split). The spine.
backend/akamai.py     tier -> model client
backend/tasks.py      (B) tag/embed/cluster-name/lesson/verify — calls router+akamai
backend/ingest.py     (A) urls -> Article (Readability; reuse LibStack)
backend/cluster.py    (C) embeddings -> TopicNode tree via should_split
backend/main.py       pipeline endpoint
frontend/             (D) Next.js app
audio_video.py        (E) Magnific MCP — audio (definite) + video (stretch)
```

## Conventions
- Modules talk **only** through `contracts.py` types — this is what keeps
  parallel agent work from colliding.
- `router.py` stays **pure policy** (deterministic, no LLM calls inside it). The
  symbolic layer is rules + thresholds, **not** a logic engine. Keep it small.
- Cheap tier by default; escalate **only** via an explicit rule in `router.py`.
- One logical change per commit; message explains WHY.
- Simplest thing that ships. A working vertical slice beats a broad half-thing.

## Run
```
cd backend && pip install -r requirements.txt && uvicorn main:app --reload
```
Set `AKAMAI_INFERENCE_URL` + `AKAMAI_API_KEY`. Update `akamai.py`'s `MODEL` map
to the actual model ids Akamai exposes at the event.

## Demo corpus
`inbox/reading-queue.md` from the knowledge vault (real bookmarks). **Web links
only** — no X/LinkedIn/IG APIs (expensive, auth hell).

## North star for the day
Core ships first (graph + grounded lessons + the routing metric). Video is
stretch. Don't gold-plate. See `roadmap.md` for the hour-by-hour + cut-line.
