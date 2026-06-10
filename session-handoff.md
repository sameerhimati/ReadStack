# Session Handoff
> Last updated: 2026-06-10 (late afternoon)

## ⏭️ NEXT SESSION: START IN PLAN MODE
Before building, enter plan mode and pick from "Open product direction" below. The
big new theme this session: **a manual curation layer over the auto-clustering** —
make the topics the user's, not just the algorithm's.

## Completed This Session (since the last handoff)
- **Claude inference fallback (`7b3e99e`)** — `akamai.py` is now provider-agnostic.
  Native Anthropic `/v1/messages` adapter (Claude isn't OpenAI-shaped, so it has its
  own path) selected by env: **Akamai (Ollama/vLLM) auto-wins when its endpoint is
  set**, **Claude when only `ANTHROPIC_API_KEY` is set**, mock otherwise. Two-tier
  Claude routing — **weak→Haiku, mid+strong→Sonnet** (Sameer's call; no Opus).
  Embeddings always local (Anthropic has no embeddings API). Verified provider
  resolution + mock regression; real Claude call validates once a key is set.
- (Earlier this session, already shipped: flatten clustering, SQLite+pgvector store,
  `/add`, lesson-first NotebookLM frontend, bookmarklet+extension, **real ElevenLabs
  audio** on lesson t12, `/snapshot` read-path, markdown mock lessons, `DEPLOY.md`.)

## Current State
- **Branch:** `fix/flatten-clustering` — **NOT pushed since `3356e38`; `7b3e99e` is
  local. Push it.** ~13 commits ahead of `main`, not merged.
- **Last commit:** `7b3e99e` Add Claude inference fallback
- **Build:** backend runs under `MOCK_INFERENCE=1`; `frontend` `npm run build` clean.
- **To go live on Claude (no GPU needed):** set `ANTHROPIC_API_KEY`, run one
  `POST /pipeline` → real Haiku/Sonnet lessons + labels + grounding. Flip in
  `AKAMAI_INFERENCE_URL` later and Akamai auto-takes-over, zero code change.

## Open product direction (DECIDE IN PLAN MODE)
**A. Manual curation layer (NEW — the session's big idea).** Turn auto-clusters into
the user's own bookmarks:
   1. **Rename topic labels** — editable + persisted (PATCH endpoint + patch the
      topics snapshot; survives rebuild via an overrides map, like audio_video does).
   2. **Drag-drop articles between topics** — override the nearest-centroid assignment
      (move-article endpoint + frontend DnD; persist the override so rebuild respects it).
   3. **Add-to-specific-label on `/add`** — `/add {url, topic_id?}`; if given, skip the
      centroid guess and drop it in that bucket. Frontend: a topic picker in the Add modal.
**B. Upgrade the embedding model.** Current `all-MiniLM-L6-v2` has a **256-token limit**
   — it only embeds each article's first ~200 words, which blurs clusters. Move to a
   long-context embedder: **`nomic-embed-text-v1.5`** (768-d, 8192-token, runs on Ollama
   → the Akamai GPU box; also puts more inference on Akamai) or **`bge-base-en-v1.5`**
   (CPU). Swap is cheap — `store_pg.py`'s vector column is dimension-agnostic; re-embed
   + rebuild. Best done when the GPU lands.
**C. Markdown rendering** (frontend) — lesson text has `**bold**`/bullets but renders
   literally. Add `react-markdown`. (Mock lessons already emit MD to test against.)
**D. Length picker (short/med/long)** — backend `lesson()` already takes `length`; needs
   a `POST /lesson {topic_id, length}` regenerate endpoint + a frontend picker.
**E. In-app article reading** — articles are external links only; add `GET /article?url=`
   (text is in the store) + a reader panel.
**F. Generate-audio button** (per lesson) — needs the Magnific **REST API key** for
   runtime backend generation (asked the contact). Pre-baked audio works now.
**G. Better graph viz** — swap React Flow Map for `react-force-graph-2d` ("lame" now).
**H. Metric honesty** — `metrics.COST_PER_CALL` is Llama-flat; recalibrate to real
   Haiku-vs-Sonnet economics so the Inference tab's "≈N× cheaper" is honest on Claude.
**I. Deploy (task #7)** — follow `DEPLOY.md`: pgvector one-click + CPU Linode + Caddy.

## Decisions made this session
- **Inference = two-tier Claude (Haiku volume / Sonnet consumable)** until/unless the
  Akamai GPU lands; the router is provider-agnostic so it's a one-env-var swap.
- **Demo framing:** lead with "Akamai-native platform (compute, pgvector, object storage,
  AND the volume embedding inference) + a provider-agnostic routing layer." The generation
  tier is a pluggable backend — Claude today, Akamai-hosted open model on one env var when a
  GPU frees up. Don't lead with "no GPUs"; mention it only if asked. If the GPU lands, do
  the **hybrid** (cheap tier on Akamai 8B, strong on Claude) — the strongest version.
- **Stay all-Akamai for everything but the generation tier:** CPU box, pgvector, object
  storage. Embeddings local on the Akamai CPU box (that's the volume inference).

## Blockers (external)
- **GPU Linode** — ticket submitted 2026-06-10, pending. Wiring = 3 env vars (`DEPLOY.md` Part 3).
- **Magnific REST API key** — asked the contact (for runtime generate-audio + best
  voice/model + limits + video budget). Audio itself is unblocked via the MCP.

## Where things live
- Deploy runbook: `DEPLOY.md`. · This session's exec plan: `~/.claude/plans/synthetic-finding-shell.md`.
- Cold-start: this file. · Next "what to build" plan: create in plan mode at kickoff.

## Start Command
```
cd backend && MOCK_INFERENCE=1 .venv/bin/uvicorn main:app --port 8000 --reload   # mock
#  live on Claude:  ANTHROPIC_API_KEY=sk-... .venv/bin/uvicorn main:app --port 8000   (then POST /pipeline once)
cd frontend && npm run dev
# demo: localhost:3000 -> Reading -> agent-security lesson -> ▶ (real ElevenLabs audio)
```
