"""
One-off: overlay pre-baked audio onto the already-baked snapshot — WITHOUT a
re-bake. Run after dropping new <topic_id>.(mp3|m4a|wav) files into data/media/.

It loads the cached snapshot, re-runs apply_audio (which now finds the files),
and saves it back. The lesson text is untouched, so audio matches what's shown.

Usage (on the box, from the backend dir):
    .venv/bin/python wire_audio.py

Reads DATABASE_URL/etc straight from backend/.env, so no `set -a && . .env`
dance is needed.
"""
from __future__ import annotations

import os
from pathlib import Path

# Load backend/.env into the environment BEFORE importing store (store.py picks
# Postgres vs SQLite at import time based on DATABASE_URL). No python-dotenv dep.
_envf = Path(__file__).parent / ".env"
if _envf.exists():
    for _line in _envf.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip("'").strip('"'))

import audio_video  # noqa: E402
import store  # noqa: E402
from contracts import Lesson  # noqa: E402


def main() -> None:
    snap = store.load_snapshot()
    if not snap or not snap.get("lessons"):
        print("No snapshot/lessons found — run a bake (POST /pipeline) first.")
        raise SystemExit(1)

    lessons = [Lesson(**l) for l in snap["lessons"]]
    audio_video.apply_audio(lessons)
    snap["lessons"] = [l.model_dump() for l in lessons]
    store.save_snapshot(snap)

    wired = sum(1 for l in lessons if l.audio_path)
    print(f"wired: {wired} of {len(lessons)} lessons now have audio")
    for l in lessons:
        mark = "♪" if l.audio_path else " "
        print(f"  [{mark}] {l.topic_id:>4}  {l.audio_path or '(no audio file)'}")


if __name__ == "__main__":
    main()
