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

    lessons, leaves = [], []
    for node in cluster.iter_nodes(tree):
        node_articles = [by_url[u] for u in node.article_urls if u in by_url]
        if node_articles:
            node.label = await tasks.cluster_name(node_articles)
        if not node.children and node_articles:
            leaves.append((node, node_articles))

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

    _adds_since_rebuild += 1

    # No structure yet, or time for a refresh -> full rebuild and find the new article.
    snapshot = store.load_snapshot()
    if snapshot is None or snapshot.get("topics") is None or _adds_since_rebuild >= _REBUILD_EVERY:
        snapshot = await _rebuild_from_store()
        _adds_since_rebuild = 0
        topic = _find_top_topic(snapshot["topics"], req.url)
        return {"ok": True, "rebuilt": True, "topic": topic,
                "lesson": _lesson_for(snapshot, topic), "snapshot": snapshot}

    # Incremental: assign to the nearest existing top-topic centroid, patch the snapshot.
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


@app.get("/health")
def health():
    return {"ok": True}
