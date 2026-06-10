# Session Handoff
> Last updated: 2026-06-10 (afternoon)

## ⏭️ NEXT SESSION: START IN PLAN MODE
Sameer's call: before building anything, enter plan mode and decide **what to build next**
from the "Open product direction" list below. Don't just execute — plan first.

## Completed This Session
Redesign shipped + live-infra prep. All on branch `fix/flatten-clustering` (pushed). Highlights:
- **Flatten clustering** — flat k-way (silhouette) top level + one `should_split` sub-level,
  max depth 2 (was a deep binary cascade). 6 topics / 13 leaves on the 67-corpus, 91% cheap-tier.
- **SQLite store + `/add`** — backlog persists, warm rebuild ≈0.1s, nearest-centroid add, survives restart.
- **pgvector dual-backend** — `store.py` selects Postgres+pgvector when `DATABASE_URL` is set,
  else SQLite. `store_sqlite.py` / `store_pg.py` share one interface. Embeddings in a real
  `vector` column (basis for a future /ask RAG).
- **Frontend rebuilt** articles-first, then **reframed lesson-first** (NotebookLM): featured
  lesson hero with the audio player front-and-center, lesson-card grid, articles demoted to
  collapsible "sources". Verified badge, dark toggle. Builds clean.
- **Add flow** — bookmarklet + MV3 extension (vision-garnish, not demo-critical).
- **REAL lesson audio** — Magnific is UNBLOCKED (plan "AI code", 30k credits). Generated the
  agent-security lesson narration via ElevenLabs **Noah Reed (voiceId 441, American)** →
  `backend/data/media/t12.mp3`, served at `/media/t12.mp3`, plays in the lesson card.
- **Live-GPU prep** — `GET /snapshot` (zero-inference cached read, loaded on mount; build-once/
  read-many so judges never trigger inference). `akamai.py` env-overridable models +
  bounded/retried chat. `tasks.py` distinct parent/child labels.
- **Mock label + markdown** — labels now 2-word doc-frequency phrases (stopgap; still rough,
  e.g. "Samples Gently"). Mock lessons emit Markdown. `lesson()` takes short/medium/long.
- **`DEPLOY.md`** — full Akamai runbook (pgvector + CPU box + Caddy + Ollama GPU).

## Current State
- **Branch:** `fix/flatten-clustering` (pushed to origin; ~10 commits ahead of `main`, NOT merged).
- **Last commit:** `01a3359` Add Akamai deploy runbook
- **Build:** backend runs under `MOCK_INFERENCE=1`; `frontend` `npm run build` clean.
- **Uncommitted:** none.
- **Running locally:** backend `:8000` (mock, SQLite, 67-corpus snapshot w/ t12 audio), frontend `:3000`.

## Open product direction (DECIDE IN PLAN MODE — Sameer's vision this session)
Sameer's framing: embed each article → group by high-level topic → per-group generate a
**short/medium/long** grounded summary (THE RAG — it sources the cluster's articles; the
writeup is the work) → **generate-audio** button (Magnific). Concrete gaps to build:
1. **Length picker (short/med/long).** Backend `lesson()` already supports `length`; needs a
   `POST /lesson {topic_id, length}` regenerate endpoint + a frontend picker on the lesson card.
2. **Markdown rendering.** Lesson text has `**bold**`/bullets but the card renders it literally.
   Add `react-markdown` to the lesson prose. (Mock lessons now emit MD to test against.)
3. **In-app article reading.** Articles are external `Open ↗` links only — Sameer wants to READ
   in-app. Needs `GET /article?url=` (text is in the store) + a reader panel/modal. Plus topic
   stacking/collapsing.
4. **Generate-audio button (per lesson).** Runtime generation needs the **Magnific REST API key**
   (the MCP is session-bound, can't be called from FastAPI). Pre-baked audio works now; wire the
   button to a key-gated `POST /lesson/audio` once the key lands.
5. **Better graph viz.** Current React Flow Map is "lame." Swap for **react-force-graph-2d**
   (animated force-directed "bloom") or Cosmograph. ~6–20 nodes, so 2D force is plenty + slick.
   Note: needs Next dynamic import (`ssr:false`).
6. **Real labels + lessons.** The mock label ceiling ("what do these even mean") is FIXED by the
   model — flip `MOCK_INFERENCE` off when the Ollama GPU lands (3 env vars, `DEPLOY.md` Part 3).
   The distinct parent/child label prompt is already written in `tasks.cluster_name`.
7. **Deploy (task #7).** Follow `DEPLOY.md`: pgvector one-click + CPU Linode + Caddy, deploy on
   mock, then wire GPU.

## Blockers (external)
- **GPU Linode** — ticket submitted 2026-06-10, pending. Wiring is 3 env vars (`DEPLOY.md` Part 3).
- **Magnific REST API key** — asked the contact for: a REST key (runtime backend audio), best
  narration voice/model + rate limits + credit cost/min, and the video_generate path + budget.
  (Audio itself is unblocked via the MCP — the key is only for the deployed runtime button.)

## Where things live
- **Deploy/provisioning runbook:** `DEPLOY.md` (repo root).
- **This session's execution plan (the redesign):** `~/.claude/plans/synthetic-finding-shell.md`.
- **Cold-start for next session:** this file.
- **Next "what to build" plan:** create it in plan mode at kickoff (Sameer's instruction).

## Start Command
```
cd backend && MOCK_INFERENCE=1 .venv/bin/uvicorn main:app --port 8000 --reload   # mock until GPU
cd frontend && npm run dev
# sanity: curl -s localhost:8000/snapshot | head -c 200
# demo: localhost:3000 -> Reading -> agent-security lesson -> ▶ (real ElevenLabs audio)
```
