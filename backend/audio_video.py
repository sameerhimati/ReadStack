"""
Module E — lesson audio (and later video).

The narrated audio IS the consumable artifact — the NotebookLM moment. Audio is
generated with Magnific (Freepik) via its MCP, which fronts the best voices
(ElevenLabs / Google). Because the MCP is an OAuth tool that lives in the Claude
session — not the FastAPI runtime — generation is a BUILD-TIME step run from the
agent session, not an HTTP call from this process. The sequence (run in-session):

    1. audio_voices_list(search="narration")   -> pick a narrator voiceId
    2. audio_tts(text=<lesson script>, voiceId=..., model="eleven_v3")
    3. creations_wait([identifier])             -> final asset `url`
    4. save_asset(url, topic_id)                -> data/media/<topic_id>.<ext>

This module owns only the persistence side: download an asset URL into data/media,
and overlay audio paths onto freshly built lessons (`apply_audio`) so the path
survives every pipeline rebuild WITHOUT a contract change — a lesson gets audio
iff data/media/<topic_id>.(m4a|mp3|wav) exists.

NOTE: Magnific requires a PREMIUM account. Until that's provisioned, a local
placeholder narration (`say`) stands in so the serve + in-browser playback path
is proven. Swap steps 1-4 for the real Magnific output when premium is available
(e.g. comped at the sponsor event) — drop the file at data/media/<topic_id>.mp3
and the next rebuild wires it automatically.
"""
from __future__ import annotations

from pathlib import Path

import httpx

from contracts import Lesson

_MEDIA = Path(__file__).parent / "data" / "media"
_EXTS = (".m4a", ".mp3", ".wav", ".mp4")


def media_file_for(topic_id: str) -> str | None:
    """The media filename for a topic if one exists in data/media, else None."""
    for ext in _EXTS:
        if (_MEDIA / f"{topic_id}{ext}").exists():
            return f"{topic_id}{ext}"
    return None


def apply_audio(lessons: list[Lesson]) -> None:
    """Overlay audio_path onto lessons from matching data/media files (by topic_id)."""
    for lesson in lessons:
        name = media_file_for(lesson.topic_id)
        if name:
            lesson.audio_path = name


def save_asset(url: str, topic_id: str, ext: str = ".mp3") -> str:
    """Download a Magnific asset URL into data/media/<topic_id><ext>. Returns the filename."""
    _MEDIA.mkdir(parents=True, exist_ok=True)
    dest = _MEDIA / f"{topic_id}{ext}"
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_bytes():
                fh.write(chunk)
    return dest.name
