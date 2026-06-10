# Session Handoff
> Last updated: 2026-06-10 (evening) — big feature session, demo recording next

## ⏭️ NEXT SESSION — "fix a lot of the features" + polish (demo IS RECORDED)
The vertical slice ships; next session is quality. Backlog from Sameer post-record:

1. **`/ux-audit` loop** — walk live localhost as a persona, fix every rough edge via
   subagents, commit atomically, re-verify with screenshots. See "UX-audit plan".
2. **Media is half-built — make it real:**
   - **No generate button exists.** Today media is PRE-BAKED only (Magnific MCP at
     build time); the UI just plays what's on disk. Add an actual **Generate audio /
     Generate video** button. Blocker: runtime gen from the deployed box needs the
     **Magnific REST key** (the box has no MCP) — either get the key, or build a
     "queue a build-time gen" flow. Decide the path first.
   - **Audio gen** — per-article/per-topic, with the spinner-while-generating moment.
   - **Video gen (J)** — never pre-baked; wire `video_generate` + the card slot.
   - **Audio length control** — let the user pick narration length (short summary vs
     full), parallel to the lesson Length picker. (`tasks.lesson` length ≠ audio length.)
3. **Tagging quality** — does `tasks.tag` produce sensible tags? Review the prompt +
   output; tags feed provisional cluster labels, so junk tags = junk labels under mock.
   Tighten the prompt / dedupe / cap count. Check against real Claude output too.
4. **Diversify the corpus** — current 67 URLs are ~all agent/ML (genuinely homogeneous,
   which is why the tree is one deep family). Add **recipes, physics, and other
   unrelated domains** to `backend/data/urls.txt` so the top level fans into clearly
   distinct themes — this also *shows off adaptive clustering* (broad themes, each
   subdivided by its own structure) far better than the mono-topic corpus does.
   After adding, re-bake (`POST /pipeline`) and eyeball the tree depth/breadth.
5. Merge `fix/flatten-clustering` → `main` once it's polished.

## Completed THIS session (all on `fix/flatten-clustering`, pushed)
Nine commits, `9d787a8..a6fb17b`:
- **Adaptive clustering (B)** — killed the brittle `0.72` coherence cutoff.
  `cluster.build` now recurses; a node splits only when its best sub-clustering is
  separable (cosine **silhouette ≥ 0.05**), tightens groups (**coherence gain ≥
  0.03**), and has **no singleton facet** (min child ≥ 2). Scale-free → no
  recalibration on embedder swap. Root always fans to 5–7 (the bloom). On the real
  67-doc corpus: clean depth-3 tree, real facets, zero noise. Thresholds live in
  `router.should_split` (pure policy); `cluster.py` only computes signals.
- **Markdown lessons (C)** — `react-markdown` with element overrides (no prose
  plugin); teasers strip markers.
- **Metric honesty (H)** — `metrics.COST_PER_CALL` now derived from REAL Anthropic
  prices (Haiku $1/$5, Sonnet $3/$15) × representative tokens; embeddings local=$0.
  Demo corpus ≈ **6.2× cheaper**, 93% of calls on the cheap tier. Honest now.
- **Length picker (D)** — `POST /lesson/regenerate {topic_id, length}` re-runs one
  lesson + its grounding check, patches the snapshot, leaves metrics untouched.
  Short/Med/Long toggle on the card swaps the markdown in place.
- **Curation layer (A)** — persisted `overrides` table (labels + assignments) in
  BOTH sqlite + pg. `PATCH /topic/{id}/label`, `POST /article/move`, optional
  `topic_id` on `/add`. Rebuild re-applies them (deterministic ids → curation
  sticks; stale target no-ops). Frontend: inline rename on the lesson-card title
  (decoupled from the graph on purpose), a "Move to…" menu per source row, and a
  topic picker in the Add modal.
- **In-app reader (E)** — `GET /article?url=` + a slide-over Reader (stale-guard
  fetch, body-scroll lock, Esc/backdrop close). Sources open in-app, original link
  kept.
- **Graph swap (G)** — ReactFlow → `react-force-graph-2d`. Canvas-drawn pills
  painted from live CSS tokens (theme-reactive), calm tuned sim, `zoomToFit` bloom,
  click→focus preserved. `reactflow` + old layout/node modules removed.
- **On-demand media (J/K)** — overlay split (audio_path vs video_path), per-article
  assets keyed by URL hash, exposed via `GET /article`. Reader shows a player per
  existing asset + a "coming soon" pill when none; card renders a video slot when a
  clip exists. **Pre-baked one real per-article summary narration** (Jake Miller /
  ElevenLabs via Magnific MCP) for the Karpathy "Recipe for Training Neural Nets"
  article → `data/media/art_62831b19addb__summary.mp3`.

## Demo state (RIGHT NOW)
- **Backend** running: `127.0.0.1:8000`, `MOCK_INFERENCE=1` (no local Anthropic key).
- **Frontend** running: `localhost:3000`.
- ⚠️ **Lesson TEXT is MOCK filler** (no key locally) — structure/graph/metrics/audio
  are all real, but lesson prose is placeholder. **To record with REAL lessons:**
  ```
  pkill -f 'uvicorn main:app'
  cd backend && ANTHROPIC_API_KEY=sk-ant-... .venv/bin/uvicorn main:app --port 8000 &
  curl -X POST localhost:8000/pipeline -d '{}' -H 'Content-Type: application/json'   # bake once
  ```
  (Or record the deployed Akamai site if it's already baked with the key.)
- ⚠️ **`t12.mp3` is content-stale**: it was generated for the pre-adaptive-clustering
  t12 (agent-security); t12 is now "Neural Networks". Regenerate topic narration
  AFTER a real Claude bake (mock text isn't worth narrating). The per-ARTICLE summary
  audio is fine (article text is stable). Demo the per-article audio in the Reader on
  "A Recipe for Training Neural Networks".
- Magnific MCP: **29,848 credits** available — plenty for post-bake narration/video.

## UX-audit plan (DEFERRED — do next)
Run `/ux-audit` against `localhost:3000` as a persona (someone with a messy reading
backlog). Walk: home/lesson-first → open a lesson → Length toggle → rename a topic →
move an article → open the Reader + play the summary audio → Map (force graph) →
Inference tab. Catalog every rough edge (hierarchy, copy, spacing, the new force
graph's legibility, mock-text placeholders, empty/coming-soon states), then fix each
via a subagent, commit atomically, re-verify with screenshots. Loop until clean.
Things already suspected to need polish: force-graph label overlap at some zooms;
the rename pencil discoverability; move-menu on long topic lists; mobile layout.

## Decisions held this session
- **No GPU/Ollama** — dropped. Stack = CPU (local nomic embeddings) + pgvector +
  **Anthropic Claude** (Haiku volume / Sonnet consumable). `akamai.py` is env-driven,
  so this was a non-event in code; just never set `AKAMAI_INFERENCE_URL`. DEPLOY.md
  Part 3 (GPU) is dead.
- **Curation rename lives on the lesson card, not the graph** — so it survived the
  graph swap.
- **Media generation is build-time via the Magnific MCP** (this Claude session), not
  runtime — the deployed box has no MCP. Runtime "generate on click" awaits the
  Magnific REST key; pre-baked assets cover the demo.

## Infra (Sameer's parallel track — should be ready)
pgvector one-click + CPU app box + Caddy + `ANTHROPIC_API_KEY` (no GPU). Runbook in
the approved plan / DEPLOY.md Parts 1–2 (skip Part 3).

## Start commands
```
cd backend && MOCK_INFERENCE=1 .venv/bin/uvicorn main:app --port 8000 --reload   # mock
#  live:  ANTHROPIC_API_KEY=sk-... .venv/bin/uvicorn main:app --port 8000  (then POST /pipeline once)
cd frontend && npm run dev
# demo: localhost:3000 -> open a lesson -> ▶ -> Length toggle -> rename -> Move -> Reader audio -> Map -> Inference
```
