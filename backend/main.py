"""ReadStack pipeline API. Ties the modules together; calls route() per task."""
from fastapi import FastAPI
from pydantic import BaseModel

from router import Task, route  # noqa: F401  (route used as modules land)

app = FastAPI(title="ReadStack")


class IngestRequest(BaseModel):
    urls: list[str]


@app.post("/pipeline")
async def pipeline(req: IngestRequest):
    """End-to-end: ingest -> tag/embed -> cluster -> lesson + verify.

    Module wiring (each lands from its own agent, coding against contracts.py):
      A) ingest.fetch(req.urls)            -> list[Article]
      B) tasks.tag / tasks.embed           via route(Task.TAG / Task.EMBED)
      C) cluster.build(articles)           -> TopicNode tree
      B) tasks.lesson(topic) + tasks.verify via route(Task.LESSON / Task.VERIFY)
    """
    return {"status": "scaffold", "received": len(req.urls)}


@app.get("/health")
def health():
    return {"ok": True}
