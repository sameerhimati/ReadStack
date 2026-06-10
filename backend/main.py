"""ReadStack pipeline API. Ties the modules together; calls route() per task.

Flow: ingest -> tag + embed -> cluster -> (relabel + lesson + verify per topic).
Everything routes through router.route(), tallied in metrics.RUN, so the response
carries the inference story alongside the product output.

Persistence (store.py) makes the backlog durable: /pipeline rebuilds from the
stored articles (no re-fetch), and /add ingests one URL and slots it into the
nearest existing topic by centroid cosine — cheap, no full recluster.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import audio_video
import cluster
import ingest
import metrics
import store
import tasks
from contracts import TopicNode

app = FastAPI(title="ReadStack")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo: let the Next dev server call us
    allow_methods=["*"],
    allow_headers=["*"],
)

_CORPUS = Path(__file__).parent / "data" / "urls.txt"
_MEDIA = Path(__file__).parent / "data" / "media"

# Re-cluster everything once this many incremental adds have piled up; until then
# /add just nearest-centroid assigns (cheap) so the structure drifts gracefully.
_REBUILD_EVERY = 5
_adds_since_rebuild = 0


@app.on_event("startup")
def _startup() -> None:
    store.init_db()
    _MEDIA.mkdir(parents=True, exist_ok=True)


# Serve generated lesson audio (Magnific) at /media/<file>.
_MEDIA.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_MEDIA)), name="media")


class IngestRequest(BaseModel):
    urls: list[str] = []


class AddRequest(BaseModel):
    url: str
    topic_id: str | None = None   # optional: drop straight into this topic


class RegenerateRequest(BaseModel):
    topic_id: str
    length: str = "medium"


class LabelRequest(BaseModel):
    label: str


class MoveRequest(BaseModel):
    url: str
    topic_id: str


class GenerateMediaRequest(BaseModel):
    kind: str = "audio"        # "audio" | "video"
    scope: str = "article"     # "article" (ref=url) | "topic" (ref=topic_id)
    ref: str
    length: str = "summary"    # audio only: "summary" | "full"


_LENGTHS = {"short", "medium", "long"}


async def _ingest_new(urls: list[str]) -> int:
    """Fetch + tag + embed the given URLs and persist them. Returns count stored."""
    fetched = await ingest.fetch(urls)
    if not fetched:
        return 0
    await asyncio.gather(*(tasks.tag(a) for a in fetched))
    await tasks.embed(fetched)
    for a in fetched:
        store.upsert_article(a)
    return len(fetched)


async def _rebuild_from_store() -> dict:
    """Cluster every stored article -> relabel + lesson + verify -> cache + return."""
    metrics.RUN.reset()
    articles = store.all_articles()
    if not articles:
        snap = {"articles": [], "topics": None, "lessons": [], "metrics": metrics.RUN.summary()}
        store.save_snapshot(snap)
        return snap

    tree = cluster.build(articles)
    by_url = {a.url: a for a in articles}

    # Honor the user's pinned assignments before naming, so labels reflect the
    # curated membership. (Build is deterministic, so topic ids are stable across
    # rebuilds on an unchanged corpus; a stale target just no-ops.)
    overrides = _overrides()
    for url, topic_id in overrides["assignments"].items():
        _move_url(tree, url, topic_id)

    # Relabel parent-before-child so each child can avoid repeating its parent's
    # label (no more "Reinforcement -> Reinforcement"); children must be facets.
    async def _relabel(node, parent_label):
        node_articles = [by_url[u] for u in node.article_urls if u in by_url]
        if node_articles:
            node.label = await tasks.cluster_name(
                node_articles, avoid=[parent_label] if parent_label else None
            )
        for child in node.children:
            await _relabel(child, node.label)

    await _relabel(tree, None)

    # User-renamed labels win over the auto names (applied after relabel).
    for topic_id, label in overrides["labels"].items():
        _set_label(tree, topic_id, label)

    lessons = []
    leaves = [
        (node, [by_url[u] for u in node.article_urls if u in by_url])
        for node in cluster.iter_nodes(tree)
        if not node.children and node.article_urls
    ]
    for node, node_articles in leaves:
        lesson = await tasks.lesson(node, node_articles)
        lesson = await tasks.verify(lesson, node_articles)
        lessons.append(lesson)

    # Overlay any generated narration (Magnific / placeholder) by topic_id.
    audio_video.apply_audio(lessons)

    snapshot = {
        "articles": [{"url": a.url, "title": a.title, "tags": a.tags} for a in articles],
        "topics": tree.model_dump(),
        "lessons": [l.model_dump() for l in lessons],
        "metrics": metrics.RUN.summary(),
    }
    store.save_snapshot(snapshot)
    return snapshot


@app.post("/pipeline")
async def pipeline(req: IngestRequest):
    """End-to-end: (urls | stored | corpus) -> {articles, topics, lessons, metrics}.

    Empty body rebuilds from the stored backlog; if the store is empty it falls
    back to the curated corpus. Explicit urls are added on top of the backlog.
    """
    global _adds_since_rebuild

    new_urls = req.urls
    if not new_urls and store.article_count() == 0:
        new_urls = _load_corpus()
    if new_urls:
        await _ingest_new(new_urls)

    snapshot = await _rebuild_from_store()
    _adds_since_rebuild = 0
    return snapshot


@app.post("/add")
async def add(req: AddRequest):
    """Add one URL: ingest -> tag + embed -> slot into the nearest top topic.

    Cheap incremental path (no recluster) until _REBUILD_EVERY adds accumulate.
    Returns the topic it landed in plus that topic's lesson, if any.
    """
    global _adds_since_rebuild

    stored = await _ingest_new([req.url])
    if not stored:
        return {"ok": False, "error": "Could not fetch or extract that URL."}

    # If the user picked a target topic, pin it now so any rebuild respects it too.
    if req.topic_id:
        ov = _overrides()
        ov["assignments"][req.url] = req.topic_id
        store.save_overrides(ov)

    _adds_since_rebuild += 1

    # No structure yet, or time for a refresh -> full rebuild and find the new article.
    snapshot = store.load_snapshot()
    if snapshot is None or snapshot.get("topics") is None or _adds_since_rebuild >= _REBUILD_EVERY:
        snapshot = await _rebuild_from_store()
        _adds_since_rebuild = 0
        topic = _find_top_topic(snapshot["topics"], req.url)
        return {"ok": True, "rebuilt": True, "topic": topic,
                "lesson": _lesson_for(snapshot, topic), "snapshot": snapshot}

    # Incremental: pin to the chosen topic if given, else the nearest centroid.
    if req.topic_id:
        tree = TopicNode.model_validate(snapshot["topics"])
        if _move_url(tree, req.url, req.topic_id):
            snapshot["topics"] = tree.model_dump()
            topic = _find_top_topic(snapshot["topics"], req.url)
        else:
            topic = _assign_nearest(req.url, snapshot)
    else:
        topic = _assign_nearest(req.url, snapshot)
    store.save_snapshot(snapshot)
    return {"ok": True, "rebuilt": False, "topic": topic,
            "lesson": _lesson_for(snapshot, topic), "snapshot": snapshot}


def _assign_nearest(url: str, snapshot: dict) -> dict | None:
    """Mutates snapshot: append url to the top topic whose centroid is closest."""
    articles = {a.url: a for a in store.all_articles()}
    target = articles.get(url)
    topics = snapshot.get("topics") or {}
    children = topics.get("children") or []
    if target is None or target.embedding is None or not children:
        return None

    v = _unit(np.asarray(target.embedding, dtype=float))
    best, best_sim = None, -1.0
    for top in children:
        embs = [articles[u].embedding for u in top.get("article_urls", [])
                if u in articles and articles[u].embedding is not None]
        if not embs:
            continue
        centroid = _unit(np.mean([_unit(np.asarray(e, dtype=float)) for e in embs], axis=0))
        sim = float(v @ centroid)
        if sim > best_sim:
            best_sim, best = sim, top

    if best is not None and url not in best["article_urls"]:
        best["article_urls"].append(url)
        topics["article_urls"] = list(dict.fromkeys(topics.get("article_urls", []) + [url]))
    return best


def _unit(vec: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(vec)
    return vec / n if n else vec


# --- curation overrides (rename topics, pin articles) ------------------------
def _overrides() -> dict:
    """Load the user's curation, normalized to {labels: {...}, assignments: {...}}."""
    ov = store.load_overrides() or {}
    ov.setdefault("labels", {})        # {topic_id: label}
    ov.setdefault("assignments", {})   # {url: topic_id}
    return ov


def _has_node(node: TopicNode, topic_id: str) -> bool:
    return node.id == topic_id or any(_has_node(c, topic_id) for c in node.children)


def _set_label(node: TopicNode, topic_id: str, label: str) -> bool:
    if node.id == topic_id:
        node.label = label
        return True
    return any(_set_label(c, topic_id, label) for c in node.children)


def _remove_url(node: TopicNode, url: str) -> None:
    if url in node.article_urls:
        node.article_urls.remove(url)
    for c in node.children:
        _remove_url(c, url)


def _add_url_to_topic(node: TopicNode, url: str, topic_id: str) -> bool:
    """Add url to the target node and every ancestor; True if target is in this subtree."""
    found_below = any([_add_url_to_topic(c, url, topic_id) for c in node.children])
    if node.id == topic_id or found_below:
        if url not in node.article_urls:
            node.article_urls.append(url)
        return True
    return False


def _move_url(tree: TopicNode, url: str, topic_id: str) -> bool:
    """Re-home url under topic_id. No-op (returns False) if the target is gone, so a
    stale override never orphans an article out of the tree."""
    if not _has_node(tree, topic_id):
        return False
    _remove_url(tree, url)
    return _add_url_to_topic(tree, url, topic_id)


def _find_top_topic(topics: dict | None, url: str) -> dict | None:
    for top in (topics or {}).get("children", []):
        if url in top.get("article_urls", []):
            return top
    return None


def _lesson_for(snapshot: dict, topic: dict | None) -> dict | None:
    """The lesson for a top topic, or one of its leaves' lessons."""
    if not topic:
        return None
    ids = {topic["id"]} | {c["id"] for c in topic.get("children", [])}
    for lesson in snapshot.get("lessons", []):
        if lesson.get("topic_id") in ids:
            return lesson
    return None


def _load_corpus() -> list[str]:
    if not _CORPUS.exists():
        return []
    return [ln.strip() for ln in _CORPUS.read_text().splitlines() if ln.strip()]


@app.patch("/topic/{topic_id}/label")
def rename_topic(topic_id: str, req: LabelRequest):
    """Rename a topic. Patches the live snapshot and persists the override so a
    rebuild keeps the user's name instead of reverting to the auto label."""
    label = req.label.strip()
    if not label:
        return {"ok": False, "error": "Label can't be empty."}
    snapshot = store.load_snapshot()
    if snapshot is None or snapshot.get("topics") is None:
        return {"ok": False, "error": "No stack yet — build the pipeline first."}

    tree = TopicNode.model_validate(snapshot["topics"])
    if not _set_label(tree, topic_id, label):
        return {"ok": False, "error": f"Unknown topic {topic_id}."}
    snapshot["topics"] = tree.model_dump()
    store.save_snapshot(snapshot)

    ov = _overrides()
    ov["labels"][topic_id] = label
    store.save_overrides(ov)
    return {"ok": True, "topic_id": topic_id, "label": label}


@app.post("/article/move")
def move_article(req: MoveRequest):
    """Move an article into a chosen topic, overriding the centroid guess. Patches
    the live snapshot and persists the pin so rebuilds respect it."""
    snapshot = store.load_snapshot()
    if snapshot is None or snapshot.get("topics") is None:
        return {"ok": False, "error": "No stack yet — build the pipeline first."}

    tree = TopicNode.model_validate(snapshot["topics"])
    if not _move_url(tree, req.url, req.topic_id):
        return {"ok": False, "error": f"Unknown topic {req.topic_id}."}
    snapshot["topics"] = tree.model_dump()
    store.save_snapshot(snapshot)

    ov = _overrides()
    ov["assignments"][req.url] = req.topic_id
    store.save_overrides(ov)
    return {"ok": True, "url": req.url, "topic_id": req.topic_id, "snapshot": snapshot}


@app.post("/lesson/regenerate")
async def regenerate_lesson(req: RegenerateRequest):
    """Rewrite one topic's lesson at a new length (short / medium / long).

    Re-runs only that lesson + its grounding check, patches the cached snapshot in
    place, and re-attaches any generated narration (keyed by topic_id). The pipeline
    metrics are deliberately left untouched — this is a single on-demand call, not a
    backlog run, so it shouldn't move the inference scoreboard.
    """
    snapshot = store.load_snapshot()
    if snapshot is None or snapshot.get("topics") is None:
        return {"ok": False, "error": "No stack yet — build the pipeline first."}

    tree = TopicNode.model_validate(snapshot["topics"])
    node = next((n for n in cluster.iter_nodes(tree) if n.id == req.topic_id), None)
    if node is None:
        return {"ok": False, "error": f"Unknown topic {req.topic_id}."}

    by_url = {a.url: a for a in store.all_articles()}
    node_articles = [by_url[u] for u in node.article_urls if u in by_url]
    if not node_articles:
        return {"ok": False, "error": "That topic has no readable articles."}

    length = req.length if req.length in _LENGTHS else "medium"
    lesson = await tasks.lesson(node, node_articles, length=length)
    lesson = await tasks.verify(lesson, node_articles)
    audio_video.apply_audio([lesson])   # re-attach existing narration by topic_id

    new_lesson = lesson.model_dump()
    new_lesson["length"] = length        # so the UI can show the active selection
    snapshot["lessons"] = [
        new_lesson if l.get("topic_id") == req.topic_id else l
        for l in snapshot.get("lessons", [])
    ]
    store.save_snapshot(snapshot)
    return {"ok": True, "lesson": new_lesson, "length": length}


@app.post("/generate-media")
async def generate_media(req: GenerateMediaRequest):
    """Generate narration/clip on demand for an article or topic, and overlay it.

    Env-gated like the inference tier: with no MAGNIFIC_API_KEY this returns
    'not_configured' (and the pre-baked assets keep playing); set the key and the
    button goes live with no code change. Returns the saved filename on success."""
    if not audio_video.generation_enabled():
        return {"ok": False, "status": "not_configured",
                "message": "Live generation needs MAGNIFIC_API_KEY on the server. "
                           "Pre-baked audio still plays."}

    # Resolve the text to narrate + the on-disk stem the overlay looks for.
    if req.scope == "article":
        art = next((a for a in store.all_articles() if a.url == req.ref), None)
        if art is None:
            return {"ok": False, "status": "error", "message": "Unknown article."}
        suffix = "__full" if req.length == "full" else "__summary"
        stem = audio_video.article_key(req.ref) + suffix
        text = art.text if req.length == "full" else art.text[:1200]
    else:  # topic
        snap = store.load_snapshot() or {}
        les = next((l for l in snap.get("lessons", []) if l["topic_id"] == req.ref), None)
        if les is None:
            return {"ok": False, "status": "error", "message": "Unknown topic lesson."}
        stem, text = req.ref, les["script"]

    try:
        if req.kind == "video":
            name = await audio_video.generate_video(text, stem)
        else:
            name = await audio_video.generate_audio(text, stem)
        return {"ok": True, "kind": req.kind, "path": name}
    except Exception as exc:  # provider/network error -> graceful, not a 500
        return {"ok": False, "status": "error", "message": str(exc)}


@app.get("/article")
def article(url: str):
    """The stored, extracted text for one article — powers the in-app reader so a
    lesson's sources open in a panel instead of a new tab. Embedding is omitted
    (too large and useless to the client)."""
    for a in store.all_articles():
        if a.url == url:
            return {"ok": True, "url": a.url, "title": a.title,
                    "text": a.text, "tags": a.tags,
                    "media": audio_video.article_media(a.url)}
    return {"ok": False, "error": "That article isn't in the stack."}


@app.get("/snapshot")
def snapshot():
    """Read-only cached pipeline output — ZERO inference.

    This is what the frontend loads and what judges hit: page views never re-run
    the models (so the GPU isn't hammered and views cost nothing). Rebuilding the
    stack is the explicit POST /pipeline.
    """
    snap = store.load_snapshot()
    if snap is None:
        return {"articles": [], "topics": None, "lessons": [],
                "metrics": metrics.RUN.summary()}
    return snap


@app.get("/health")
def health():
    return {"ok": True}
