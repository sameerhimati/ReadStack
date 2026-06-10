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

import hashlib
import os
from pathlib import Path

import httpx

from contracts import Lesson

_MEDIA = Path(__file__).parent / "data" / "media"
_AUDIO_EXTS = (".m4a", ".mp3", ".wav")
_VIDEO_EXTS = (".mp4", ".webm")

# Runtime generation provider (Magnific/Freepik REST). Empty -> generation is off
# and the API returns "not_configured"; pre-baked assets (dropped via the MCP at
# build time) keep playing regardless. Set MAGNIFIC_API_KEY to turn the button on.
_MAGNIFIC_KEY = os.getenv("MAGNIFIC_API_KEY", "")
_MAGNIFIC_BASE = os.getenv("MAGNIFIC_BASE_URL", "https://api.magnific.ai")


def generation_enabled() -> bool:
    return bool(_MAGNIFIC_KEY)


def _find(stem: str, exts: tuple[str, ...]) -> str | None:
    for ext in exts:
        if (_MEDIA / f"{stem}{ext}").exists():
            return f"{stem}{ext}"
    return None


def article_key(url: str) -> str:
    """Stable, filesystem-safe stem for a per-article asset (audio/video)."""
    return "art_" + hashlib.sha1(url.encode()).hexdigest()[:12]


def media_file_for(topic_id: str) -> str | None:
    """The audio filename for a topic if one exists in data/media, else None."""
    return _find(topic_id, _AUDIO_EXTS)


def apply_audio(lessons: list[Lesson]) -> None:
    """Overlay audio_path AND video_path onto lessons from matching data/media files.

    A topic gets narration iff data/media/<topic_id>.(m4a|mp3|wav) exists, and a clip
    iff <topic_id>.(mp4|webm) exists — so generated media survives every rebuild
    without a contract change."""
    for lesson in lessons:
        audio = _find(lesson.topic_id, _AUDIO_EXTS)
        if audio:
            lesson.audio_path = audio
        video = _find(lesson.topic_id, _VIDEO_EXTS)
        if video:
            lesson.video_path = video


def article_media(url: str) -> dict:
    """Per-article assets keyed by URL hash: full / summary narration + a clip.

    Stems: <key>__full, <key>__summary (audio) and <key> (video). Any missing one
    is None — the reader shows a generate affordance for those."""
    key = article_key(url)
    return {
        "audio_full": _find(f"{key}__full", _AUDIO_EXTS),
        "audio_summary": _find(f"{key}__summary", _AUDIO_EXTS),
        "video": _find(key, _VIDEO_EXTS),
    }


async def generate_audio(text: str, stem: str, *, ext: str = ".mp3") -> str:
    """Generate narration via Magnific's REST API and save it to data/media/<stem><ext>.

    This is the RUNTIME path (the deployed box has no MCP). Reached only when
    MAGNIFIC_API_KEY is set. NOTE: the endpoint/payload below is the integration
    point — confirm it against Magnific's REST docs when the key lands; the rest of
    the pipeline (save + overlay) is provider-agnostic.
    """
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(
            f"{_MAGNIFIC_BASE}/v1/audio/tts",
            headers={"Authorization": f"Bearer {_MAGNIFIC_KEY}"},
            json={"text": text[:3000], "model": "eleven_v3"},
        )
        r.raise_for_status()
        asset_url = r.json()["url"]      # adjust to the real response shape
    return save_asset(asset_url, stem, ext)


async def generate_video(text: str, stem: str, *, ext: str = ".mp4") -> str:
    """Generate a short clip via Magnific's REST API and save it. Runtime path; same
    integration-point caveat as generate_audio."""
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(
            f"{_MAGNIFIC_BASE}/v1/video/generate",
            headers={"Authorization": f"Bearer {_MAGNIFIC_KEY}"},
            json={"prompt": text[:1000]},
        )
        r.raise_for_status()
        asset_url = r.json()["url"]      # adjust to the real response shape
    return save_asset(asset_url, stem, ext)


def save_asset(url: str, stem: str, ext: str = ".mp3") -> str:
    """Download a Magnific asset URL into data/media/<stem><ext>. Returns the filename.

    `stem` is a topic_id for per-topic media or an article_key(+suffix) for
    per-article media."""
    _MEDIA.mkdir(parents=True, exist_ok=True)
    dest = _MEDIA / f"{stem}{ext}"
    with httpx.stream("GET", url, timeout=180, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_bytes():
                fh.write(chunk)
    return dest.name
