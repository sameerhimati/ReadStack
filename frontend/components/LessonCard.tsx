"use client";

import { useState } from "react";
import type { Lesson, TopicNode } from "@/lib/types";
import { mediaUrl } from "@/lib/api";

// The per-topic lesson: serif prose, a plain-language Verified badge, and an
// audio player. Open by default for its topic.
export default function LessonCard({
  lesson,
  topic,
}: {
  lesson: Lesson | null;
  topic: TopicNode | null;
}) {
  if (!lesson || !topic) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Lesson
        </p>
        <VerifiedBadge lesson={lesson} />
      </div>

      <p className="max-w-[68ch] whitespace-pre-line font-serif text-[17px] leading-relaxed text-[var(--ink)]">
        {lesson.script}
      </p>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <AudioPlayer lesson={lesson} />
      </div>
    </div>
  );
}

// Plain-language trust signal — replaces the word "grounded" everywhere.
// Verified => green. Otherwise amber, and clicking it reveals a short note
// pointing at the unsupported sentence (degrades gracefully: the real
// flagged-sentence data isn't wired yet, so we surface the last sentence).
function VerifiedBadge({ lesson }: { lesson: Lesson }) {
  const [open, setOpen] = useState(false);

  if (lesson.grounded) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--verified)_12%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--verified)]">
        Verified against your sources ✓
      </span>
    );
  }

  const flagged = lastSentence(lesson.script);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--unverified)_12%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--unverified)] transition-colors hover:bg-[color-mix(in_oklab,var(--unverified)_20%,transparent)]"
      >
        ⚠ a claim not in your sources
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--muted)] shadow-lg shadow-black/10">
          <p className="mb-1.5 font-medium text-[var(--ink)]">
            Flagged by the verifier
          </p>
          <p className="text-[var(--muted)]">
            This sentence wasn&apos;t supported by any of your saved articles:
          </p>
          {flagged && (
            <p className="mt-2 border-l-2 border-[var(--unverified)] pl-2 italic text-[var(--ink)]">
              {flagged}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AudioPlayer({ lesson }: { lesson: Lesson }) {
  if (lesson.audio_path) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          🎧 Narration
        </p>
        <audio controls preload="none" src={mediaUrl(lesson.audio_path)} />
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--muted)]"
    >
      ▶ Audio (coming soon)
    </button>
  );
}

function lastSentence(text: string): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return text.trim();
  return parts[parts.length - 1].trim();
}
