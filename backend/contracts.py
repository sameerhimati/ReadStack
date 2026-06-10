"""Shared data contracts. Every parallel module codes against these types."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class Task(str, Enum):
    TAG = "tag"
    EMBED = "embed"
    CLUSTER = "cluster"
    LESSON = "lesson"
    VERIFY = "verify"


class Tier(str, Enum):
    EMBED = "embed"
    WEAK = "weak"
    MID = "mid"
    STRONG = "strong"


class Article(BaseModel):
    url: str
    title: str = ""
    text: str = ""
    tags: list[str] = []
    embedding: list[float] | None = None


class TopicNode(BaseModel):
    id: str
    label: str
    article_urls: list[str] = []
    children: list[TopicNode] = []
    depth: int = 0


class Lesson(BaseModel):
    topic_id: str
    script: str
    grounded: bool = False
    grounding_score: float = 0.0
    video_path: str | None = None


class RouteDecision(BaseModel):
    task: Task
    tier: Tier


TopicNode.model_rebuild()
