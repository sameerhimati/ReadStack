"""
Persistence selector.

One env var decides the backend, nothing else changes: set DATABASE_URL (the
Linode pgvector one-click) and the whole app runs on Postgres + pgvector; leave
it unset and it's zero-setup SQLite. Both modules expose the identical interface
(init_db, upsert_article, all_articles, article_count, save_snapshot,
load_snapshot), so main.py just imports `store`.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

if os.getenv("DATABASE_URL"):
    from store_pg import (  # noqa: F401
        all_articles,
        article_count,
        init_db,
        load_snapshot,
        save_snapshot,
        upsert_article,
    )

    log.info("store: using Postgres + pgvector (DATABASE_URL set)")
else:
    from store_sqlite import (  # noqa: F401
        all_articles,
        article_count,
        init_db,
        load_snapshot,
        save_snapshot,
        upsert_article,
    )

    log.info("store: using SQLite (no DATABASE_URL)")
