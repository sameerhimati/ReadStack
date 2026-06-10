# Session Handoff
> Last updated: 2026-06-10

## Completed This Session
Executed the approved redesign (`~/.claude/plans/synthetic-finding-shell.md`).
Six commits on branch `fix/flatten-clustering` (each = one logical step):
- [x] **Flatten clustering** (`5ff395a`) — `cluster.py` now does flat k-way top level
  (k by silhouette, 5–7) + ONE `should_split`-gated sub-level. Max depth 2. On the
  67-corpus: 6 top topics / 13 leaves, 91% cheap-tier (was a deep binary cascade).
- [x] **SQLite store + `/add`** (`a0e10d6`) — `store.py` (articles + cached snapshot,
  embeddings as float32 blobs). `/pipeline` rebuilds from the store (warm ≈0.1s vs
  ≈20s re-fetch). `/add` ingests one URL → nearest-centroid assign → persist.
  Survives restart. `/media` mounted for audio.
- [x] **Frontend rebuilt articles-first** (`e46ba24`) — warm-editorial (terracotta/
  paper, serif reading, dark toggle), Reading/Map/Inference tabs, "Verified against
  your sources" badge replacing "grounded". Build clean. (Agent caught a real
  Tailwind v4 bug: bare `[--token]` doesn't expand — uses `[var(--token)]`/color-mix.)
- [x] **Add flow** (`76b7cd6`) — bookmarklet + unpacked MV3 extension → `/add`.
- [x] **Lesson audio wired** (`08f8562`) — `audio_video.py`: download Magnific asset +
  `apply_audio()` overlays `audio_path` by topic_id on every rebuild. Proven on the
  agent-security lesson with a local placeholder narration.
- [x] **Live-GPU prep** (`041ccd1`) — `GET /snapshot` (zero-inference cached read,
  loaded on mount); `akamai.py` env-overridable model ids + bounded/retried chat;
  `tasks.py` distinct parent/child labels (avoid param) + bounded prompts.

## Current State
- **Branch:** `fix/flatten-clustering` — **6 commits ahead of `main`, NOT pushed/merged.**
  (Branch name is stale; it holds the whole redesign. Decide: merge to main / open PR.)
- **Last commit:** `041ccd1` Prep for live GPU: cached read-path + bounded inference
- **Build:** passing (backend runs under `MOCK_INFERENCE=1`; `frontend` `npm run build` clean)
- **Uncommitted changes:** none (clean tree)
- **Blockers (both external, both Sameer's to clear):**
  - **GPU Linode** — ticket submitted 2026-06-10, pending. `akamai.py` endpoint waits on it.
  - **Magnific = premium-gated.** MCP is authed but `account_balance`/`audio_tts` return
    "requires a premium account." Real voice blocked until premium (likely comped at the
    event). Placeholder audio stands in; swap is one MCP call.

## Next Session Should
1. **Opening gambit — deploy on mock first (de-risks the public URL before the GPU lands).**
   Create `backend/Dockerfile`, a `Caddyfile` (auto-HTTPS, serve frontend + reverse-proxy
   `/snapshot`/`/pipeline`/`/add`/`/media` → uvicorn), and `DEPLOY.md`. Then provision a
   **4GB CPU Linode**, deploy, run one `POST /pipeline` to bake the snapshot, confirm a
   browser hits `GET /snapshot` over HTTPS. (Task #7.)
2. **When the GPU ticket clears:** on the GPU Linode `ollama serve` + `ollama pull
   llama3.1:8b`; on the backend set `AKAMAI_INFERENCE_URL=http://<gpu>:11434`,
   `AKAMAI_MODEL_WEAK=llama3.1:8b`, unset `MOCK_INFERENCE`; one `POST /pipeline` to bake
   real lessons/labels; eyeball that labels are distinct and lessons grounded.
3. **Polish:** run `/design-review` on the live articles-first UI; run the demo twice.

## Context to Remember
- **Architecture: build-once / read-many.** `POST /pipeline` is the (admin) rebuild and is
  the ONLY path that runs LLM inference. Judges/views hit `GET /snapshot` (cached, zero
  inference) so the GPU is never hammered and views cost nothing. Frontend loads `/snapshot`
  on mount; "Load demo corpus" is the explicit rebuild.
- **Inference is provider-agnostic.** `akamai.py` is OpenAI-compatible and model ids are env
  vars → **Ollama and vLLM are both drop-in, zero code change** (`{BASE}/v1/chat/completions`).
  Decision: **start with Ollama** (fast, our low-concurrency-by-design makes its weaker
  batching irrelevant); swap to vLLM later only if we want the throughput/pitch.
- **Routing metric is honest regardless of which models physically exist** — it's computed
  from `route()` decisions + `metrics.COST_PER_CALL`, not live calls. Fine to point every
  tier at the same 8B for the demo.
- **Demo audio detail:** the wired lesson is **t12** (agent security — lethal trifecta /
  securing LLM agents / CaMeL), file `backend/data/media/t12.m4a` (gitignored). `audio_path`
  lives in the SQLite snapshot and is re-applied on every rebuild by filename match
  (`audio_video.apply_audio`). **Topic ids (t12 etc.) are only stable for the canonical
  67-URL corpus build; an `/add` before the demo reshuffles ids** → regenerate audio named
  for the new leaf id if that happens. KMeans is `random_state=0` so the 67-build is
  deterministic.
- **Both `*.db` and `data/media/` are gitignored** — the DB and audio live on the machine,
  not in git. A fresh clone needs one `POST /pipeline` to rebuild the snapshot.
- **Hosting plan (decided):** single 4GB CPU Linode + Caddy for backend+frontend (one HTTPS
  origin, no CORS/mixed-content), co-located with the GPU Linode. **The mixed-content trap:
  HTTPS frontend → HTTP backend silently blocks every fetch** — Caddy single-origin avoids it.
  pgvector + Linode Object Storage are real but **post-demo** (SQLite + local `/media` ship now).
- **The extension is vision-garnish, not demo-critical** (decided) — judges won't install it;
  the useful add path is the in-app `+ Add`. Keep it, don't feature it, don't invest more.
- **Possible follow-up Sameer flagged:** a `POST /ask` RAG endpoint (cosine top-k over the
  store → grounded answer) + article chunking. Not built, not in scope; store already supports it.

## Start Command
```
# backend (mock until the GPU lands)
cd backend && MOCK_INFERENCE=1 .venv/bin/uvicorn main:app --port 8000 --reload
# frontend
cd frontend && npm run dev
# sanity: curl -s localhost:8000/snapshot | head -c 200
```
