"""
Postgres + pgvector store — the on-Akamai production path.

Same interface as store_sqlite.py, but embeddings live in a real `vector` column
so similarity can run SQL-side (this is what a future POST /ask top-k retrieval
would lean on). Selected automatically by store.py when DATABASE_URL is set
(e.g. the Linode pgvector one-click). The column is an unconstrained `vector`
(no fixed dim) so swapping the embedder — 384-d MiniLM today, 768-d Ollama later
— doesn't require a migration; exact cosine search is plenty at demo scale.

Connection string comes from DATABASE_URL, e.g.
    postgresql://user:pass@<linode-ip>:5432/readstack
"""
from __future__ import annotations

import json
import os

import psycopg
from pgvector.psycopg import register_vector

from contracts import Article

_DSN = os.getenv("DATABASE_URL", "")


def _conn() -> psycopg.Connection:
    conn = psycopg.connect(_DSN, autocommit=True)
    register_vector(conn)
    return conn


def init_db() -> None:
    """Enable pgvector and create tables. Safe to call on every startup."""
    with _conn() as c:
        c.execute("CREATE EXTENSION IF NOT EXISTS vector")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS articles (
                url        text PRIMARY KEY,
                title      text NOT NULL DEFAULT '',
                text       text NOT NULL DEFAULT '',
                tags_json  text NOT NULL DEFAULT '[]',
                embedding  vector,
                added_at   timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshot (
                id         int PRIMARY KEY CHECK (id = 1),
                json       jsonb NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )


def upsert_article(article: Article) -> None:
    """Insert or replace one article (keyed by url)."""
    with _conn() as c:
        c.execute(
            """
            INSERT INTO articles (url, title, text, tags_json, embedding)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (url) DO UPDATE SET
                title = EXCLUDED.title, text = EXCLUDED.text,
                tags_json = EXCLUDED.tags_json, embedding = EXCLUDED.embedding
            """,
            (
                article.url,
                article.title,
                article.text,
                json.dumps(article.tags),
                article.embedding,  # list[float] -> vector via register_vector
            ),
        )


def all_articles() -> list[Article]:
    """Rehydrate every stored article, embedding included."""
    with _conn() as c:
        rows = c.execute(
            "SELECT url, title, text, tags_json, embedding FROM articles ORDER BY added_at"
        ).fetchall()
    return [
        Article(
            url=r[0],
            title=r[1],
            text=r[2],
            tags=json.loads(r[3]),
            embedding=r[4].tolist() if r[4] is not None else None,
        )
        for r in rows
    ]


def article_count() -> int:
    with _conn() as c:
        return c.execute("SELECT COUNT(*) FROM articles").fetchone()[0]


def save_snapshot(snapshot: dict) -> None:
    """Cache the latest pipeline output (topics + lessons + metrics)."""
    with _conn() as c:
        c.execute(
            """
            INSERT INTO snapshot (id, json, updated_at) VALUES (1, %s, now())
            ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = now()
            """,
            (json.dumps(snapshot),),
        )


def load_snapshot() -> dict | None:
    """The last cached pipeline output, or None if we've never built one."""
    with _conn() as c:
        row = c.execute("SELECT json FROM snapshot WHERE id = 1").fetchone()
    return row[0] if row else None
