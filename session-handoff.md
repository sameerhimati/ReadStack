# Session Handoff
> Last updated: 2026-06-10

## Completed This Session
- [x] Initialized public repo (github.com/sameerhimati/ReadStack), 9 commits on `main`
- [x] Built Wave 1 vertical slice (runs end-to-end under `MOCK_INFERENCE=1`):
  - `ingest.py` (trafilatura, concurrent, fault-tolerant) — **real**
  - `cluster.py` (embeddings → TopicNode tree via `router.should_split`) — **real**
  - `tasks.py` (tag/embed/cluster_name/lesson/verify) — real routing+metrics, **mock outputs**
  - `akamai.py` (MOCK_INFERENCE mode + local sentence-transformers embed fallback)
  - `metrics.py` (tier counts, cost-vs-all-strong, grounding catch-rate)
  - `main.py` (`/pipeline` wired), Next.js `frontend/` (builds clean)
- [x] Replaced X-heavy corpus → **67 validated web articles** (`data/urls.txt`)
- [x] Tuned clustering (ward bisection + thresholds) → 92% cheap-tier, 15.3× savings, 3/12 claims caught
- [x] Diagnosed the topic graph as nonsensical (deep binary tree + mock labels)
- [x] Wrote `design.md` (warm-editorial system from LibStack/personal-site/atlas)
- [x] **Locked the redesign plan** → `~/.claude/plans/ancient-doodling-river.md`

## Current State
- **Branch:** main
- **Last commit:** `6895c5c` Add design system + audio_path field
- **Build:** passing (backend pipeline runs; `frontend` `npm run build` clean)
- **Uncommitted changes:** none (clean tree)
- **Blockers:** Akamai vLLM endpoint pending (Sameer provisioning a **GPU Linode**).
  Magnific MCP is **now connected/authed → audio unblocked.**

## Next Session Should
1. **Opening gambit:** Open `~/.claude/plans/ancient-doodling-river.md` (the approved
   plan) + `backend/cluster.py`. Execute **Step 1 — flatten clustering**: replace the
   recursive binary `_split` with flat k-way (~5–7 top topics) + ONE `should_split`-gated
   sub-level (max depth 2). Re-run `MOCK_INFERENCE=1` on the 67-URL corpus and eyeball the tree.
2. Then **parallel agents** (per plan): frontend rebuild articles-first per `design.md`
   (Reading/Map/Inference tabs, "Verified against your sources" badge); `backend/store.py`
   SQLite + `POST /add` (incremental nearest-centroid assign); bookmarklet + minimal MV3 `extension/`.
3. As blockers clear: wire real `tasks.py` prompts when Akamai lands; **generate lesson
   audio via the now-connected Magnific MCP** (build-time, store under `data/media/`, set `audio_path`).
4. Run `/design-review` on the live articles-first UI.

## Context to Remember
- **Two Claude sessions share this repo.** THIS session owns A/C/D/E + plumbing + corpus.
  The OTHER session owns `tasks.py` real prompts + `akamai.py` endpoint + Magnific wiring.
  **Coordinate, don't overwrite** `tasks.py`/`akamai.py`.
- **Linode = Akamai.** GPU Linode = the vLLM endpoint for `akamai.py`; Linode Object
  Storage = audio/static hosting; Linode managed Postgres = where SQLite store lifts to.
  Pick a **GPU plan** when creating the Linode (plain VM won't serve models).
- **Metric is honest at 15×, not 50×** — the few strong lesson/verify calls weigh heavily
  on only 67 articles; the ratio grows with backlog size. Pitch it that way.
- **Magnific is an MCP (OAuth), not a backend API** — generate audio at build-time via the
  MCP in the Claude session, not from the FastAPI runtime. (Runtime would need the Freepik HTTP API.)
- **Embeddings** auto-fall-back to local `all-MiniLM-L6-v2` when no Akamai endpoint — so
  clustering always works offline.
- `MOCK_INFERENCE=1` (or no `AKAMAI_INFERENCE_URL`) stubs chat but keeps routing/metrics real.
- Servers may still be running on :8000 / :3000 from this session.

## Start Command
```
# backend
cd backend && MOCK_INFERENCE=1 .venv/bin/uvicorn main:app --reload
# frontend (separate terminal)
cd frontend && npm run dev
# sanity: curl -s localhost:8000/health
```
