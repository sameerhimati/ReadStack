"""
SQLite store — the zero-setup default (local dev, single-box demos).

Keeps the raw `articles` (embeddings packed as float32 blobs) plus one cached
pipeline `snapshot` (topics + lessons + metrics). Mirrors store_pg.py's interface
exactly so `store.py` can pick either at import time via DATABASE_URL.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from contracts import Article

_DB_PATH = Path(__file__).parent / "data" / "readstack.db"


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS articles (
                url            TEXT PRIMARY KEY,
                title          TEXT NOT NULL DEFAULT '',
                text           TEXT NOT NULL DEFAULT '',
                tags_json      TEXT NOT NULL DEFAULT '[]',
                embedding_blob BLOB,
                added_at       TEXT NOT NULL
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshot (
                id         INTEGER PRIMARY KEY CHECK (id = 1),
                json       TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def _pack(embedding: list[float] | None) -> bytes | None:
    if not embedding:
        return None
    return np.asarray(embedding, dtype="<f4").tobytes()


def _unpack(blob: bytes | None) -> list[float] | None:
    if blob is None:
        return None
    return np.frombuffer(blob, dtype="<f4").tolist()


def upsert_article(article: Article) -> None:
    """Insert or replace one article (keyed by url)."""
    with _conn() as c:
        c.execute(
            """
            INSERT INTO articles (url, title, text, tags_json, embedding_blob, added_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                title=excluded.title, text=excluded.text,
                tags_json=excluded.tags_json, embedding_blob=excluded.embedding_blob
            """,
            (
                article.url,
                article.title,
                article.text,
                json.dumps(article.tags),
                _pack(article.embedding),
                datetime.now(timezone.utc).isoformat(),
            ),
        )


def all_articles() -> list[Article]:
    """Rehydrate every stored article, embedding included."""
    with _conn() as c:
        rows = c.execute(
            "SELECT url, title, text, tags_json, embedding_blob FROM articles ORDER BY added_at"
        ).fetchall()
    return [
        Article(
            url=r["url"],
            title=r["title"],
            text=r["text"],
            tags=json.loads(r["tags_json"]),
            embedding=_unpack(r["embedding_blob"]),
        )
        for r in rows
    ]


def article_count() -> int:
    with _conn() as c:
        return c.execute("SELECT COUNT(*) AS n FROM articles").fetchone()["n"]


def save_snapshot(snapshot: dict) -> None:
    """Cache the latest pipeline output (topics + lessons + metrics)."""
    with _conn() as c:
        c.execute(
            """
            INSERT INTO snapshot (id, json, updated_at) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at
            """,
            (json.dumps(snapshot), datetime.now(timezone.utc).isoformat()),
        )


def load_snapshot() -> dict | None:
    """The last cached pipeline output, or None if we've never built one."""
    with _conn() as c:
        row = c.execute("SELECT json FROM snapshot WHERE id = 1").fetchone()
    return json.loads(row["json"]) if row else None
