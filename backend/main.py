"""ReadStack pipeline API. Ties the modules together; calls route() per task.

Flow: ingest -> tag + embed -> cluster -> (relabel + lesson + verify per topic).
Everything routes through router.route(), tallied in metrics.RUN, so the response
carries the inference story alongside the product output.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import cluster
import ingest
import metrics
import tasks
from contracts import Article, TopicNode

app = FastAPI(title="ReadStack")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo: let the Next dev server call us
    allow_methods=["*"],
    allow_headers=["*"],
)

_CORPUS = Path(__file__).parent / "data" / "urls.txt"


class IngestRequest(BaseModel):
    urls: list[str] = []


@app.post("/pipeline")
async def pipeline(req: IngestRequest):
    """End-to-end: urls -> {articles, topics, lessons, metrics}."""
    metrics.RUN.reset()

    urls = req.urls or _load_corpus()
    articles = await ingest.fetch(urls)
    if not articles:
        return {"articles": [], "topics": None, "lessons": [], "metrics": metrics.RUN.summary()}

    # Tag (parallel, high volume) then embed (batched).
    await asyncio.gather(*(tasks.tag(a) for a in articles))
    await tasks.embed(articles)

    # Structure: embeddings -> TopicNode tree via the router's split rule.
    tree = cluster.build(articles)
    by_url = {a.url: a for a in articles}

    # Relabel every node from its articles; write+verify a lesson for each leaf.
    lessons = []
    leaves = []
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

    return {
        "articles": [{"url": a.url, "title": a.title, "tags": a.tags} for a in articles],
        "topics": tree.model_dump(),
        "lessons": [l.model_dump() for l in lessons],
        "metrics": metrics.RUN.summary(),
    }


def _load_corpus() -> list[str]:
    if not _CORPUS.exists():
        return []
    return [ln.strip() for ln in _CORPUS.read_text().splitlines() if ln.strip()]


@app.get("/health")
def health():
    return {"ok": True}
