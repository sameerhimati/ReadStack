"use client";

import { useState } from "react";
import type { Article, Lesson } from "@/lib/types";
import { mediaUrl } from "@/lib/api";
import { hostOf } from "@/lib/lessons";

// Plain-language trust signal — replaces the word "grounded" everywhere.
// Verified => green. Otherwise amber, and clicking it reveals a short note
// pointing at the unsupported sentence (degrades gracefully: the real
// flagged-sentence data isn't wired yet, so we surface the last sentence).
export function VerifiedBadge({ lesson }: { lesson: Lesson }) {
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
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

// The audio affordance — the gravitational center. When audio is ready, the
// native player; otherwise a tasteful, honest "coming soon" pill.
export function AudioPlayer({
  lesson,
  prominent = false,
}: {
  lesson: Lesson;
  prominent?: boolean;
}) {
  if (lesson.audio_path) {
    return (
      <audio
        controls
        preload="none"
        src={mediaUrl(lesson.audio_path)}
        className={prominent ? "w-full" : ""}
      />
    );
  }
  return (
    <button
      type="button"
      disabled
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--muted)]"
    >
      ▶ Listen — audio coming soon
    </button>
  );
}

// Collapsible list of the articles that ground a lesson. Demoted from the home
// hierarchy: sources live behind this toggle, collapsed by default.
export function SourceList({
  urls,
  articleByUrl,
  open,
  onToggle,
}: {
  urls: string[];
  articleByUrl: Map<string, Article>;
  open: boolean;
  onToggle: () => void;
}) {
  const count = urls.length;
  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
      >
        <span
          className={[
            "inline-block transition-transform",
            open ? "rotate-90" : "",
          ].join(" ")}
          aria-hidden
        >
          ▸
        </span>
        {count} {count === 1 ? "source" : "sources"}
      </button>

      {open && count > 0 && (
        <div className="mt-2 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {urls.map((url) => {
            const article = articleByUrl.get(url);
            const title = article?.title ?? url;
            return (
              <div key={url} className="flex items-baseline gap-3 py-2.5">
                <span className="font-medium text-[var(--ink)]">{title}</span>
                <span className="text-xs text-[var(--muted)]">
                  {hostOf(url)}
                </span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-auto shrink-0 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
                >
                  Open ↗
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Full lesson prose at reading measure.
export function LessonProse({ script }: { script: string }) {
  return (
    <p className="max-w-[68ch] whitespace-pre-line font-serif text-[17px] leading-relaxed text-[var(--ink)]">
      {script}
    </p>
  );
}

function lastSentence(text: string): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return text.trim();
  return parts[parts.length - 1].trim();
}
