# ReadStack — Build Roadmap

**Goal:** a working demo proving a better INFERENCE CHOICE (route model → task on
Akamai GPUs) makes consuming a whole backlog of saved reading easy. Tight
vertical slice + a clean story. (Sheila: *"build fast, reiterate."*)

## The thesis
There's too much to read and too little time to consume it. ReadStack uses
**Akamai-hosted open models to embed / parse / summarize** your saved articles
(per-article and per-topic), then **Magnific to turn them into audio (and
video)** you can actually consume — a personal NotebookLM for your bookmarks.
The inference choice: route the right model to the right task across Akamai's
**3 GPU tiers** — cheap 8B for the volume work, stronger only for what a human
consumes. Cheap, grounded, scales to a whole backlog.

## Two sponsors — use BOTH
- **Akamai** = the brain: vLLM-served tiered open models on edge GPUs + the router.
- **Magnific (Freepik)** = the media, via their **MCP**: generate **audio
  (definite — podcast / NotebookLM-style narration)** and **video (stretch)**
  from the lesson content. One MCP fronts the best voice/image/video models
  (ElevenLabs, Grok, etc.).

## P0 — Deploy first — *you* — running blocks on this
Deploy a small open model via vLLM on an Akamai GPU → OpenAI-compatible endpoint
→ into `akamai.py`. See the deploy runbook / akamai-developers vLLM quickstart.
Embeddings: local `sentence-transformers` (fast, invisible plumbing).

## Build — parallel
- **A ingest** (reuse LibStack): urls → `Article`
- **B tasks** (you): tag / embed / cluster-name / lesson / verify via `route()`
- **C cluster**: embeddings → `should_split` → `TopicNode` tree
- **D frontend**: easy **add-links input** + topic graph + lesson cards (grounded
  badge) + metric panel
- **GATE:** end-to-end on the reading-queue corpus → `{topics, lessons}`

## Audio / Video — *E* (audio DEFINITE, video stretch)
- Magnific MCP: lesson content → narrated **audio** (short / medium / long form),
  then **video** if time. Embedded in the lesson card — the NotebookLM moment.

## Metric + polish — *you*
- tier counters · cost vs all-frontier baseline · grounding catch-rate → on-screen
- run the demo twice; fix what breaks

## Priority order (hold it)
CORE: add-links input + topic graph + grounded lessons + metric →
THEN audio (Magnific) → THEN video. Don't gold-plate the core before audio works.

## 4-min stage demo
1. "Too many bookmarks, no time." Add links / load the corpus.
2. Graph blooms — topics/subtopics auto-organized; granularity by **rules**.
3. Open a lesson — grounded badge; verifier **catching an unsupported claim**.
4. Hit play — Magnific **narrates the lesson as audio**. ← the NotebookLM wow
5. The panel: most calls on the cheap 8B on an **Akamai edge GPU**, grounded —
   "right model on the right GPU for the task." ← the inference point
6. Close: "the inference choice is what makes consuming your whole backlog easy."

## Cuts: voice agents · multi-source APIs · auth · DB · training a model.
