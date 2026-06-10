"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Article, Lesson, LessonLength, PipelineResponse } from "@/lib/types";
import { mediaUrl, moveArticle, regenerateLesson } from "@/lib/api";
import { hostOf, type TopicOption } from "@/lib/lessons";

const LENGTHS: { value: LessonLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

// A 3-way segmented toggle that rewrites a lesson at a new length. Owns the
// per-lesson loading state; on success it hands the regenerated lesson up via
// `onLessonUpdated` so the page-level source of truth (and thus the rendered
// markdown) updates in place. On failure it keeps the old text — no crash.
export function LengthPicker({
  lesson,
  onLessonUpdated,
}: {
  lesson: Lesson;
  onLessonUpdated: (updated: Lesson) => void;
}) {
  const [busy, setBusy] = useState(false);
  const active: LessonLength = lesson.length ?? "medium";

  async function pick(length: LessonLength) {
    if (busy || length === active) return;
    setBusy(true);
    const res = await regenerateLesson(lesson.topic_id, length);
    if (res.ok) onLessonUpdated(res.lesson);
    setBusy(false);
  }

  return (
    <div
      className="inline-flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5">
        {LENGTHS.map(({ value, label }) => {
          const isActive = value === active;
          return (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => pick(value)}
              aria-pressed={isActive}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                isActive
                  ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>
      {busy && (
        <span className="text-xs italic text-[var(--muted)]">rewriting…</span>
      )}
    </div>
  );
}

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
  currentTopicId,
  topicOptions,
  onSnapshotReplaced,
}: {
  urls: string[];
  articleByUrl: Map<string, Article>;
  open: boolean;
  onToggle: () => void;
  currentTopicId: string;
  topicOptions: TopicOption[];
  onSnapshotReplaced: (snapshot: PipelineResponse) => void;
}) {
  const count = urls.length;
  // The topics an article can move into: every leaf lesson except this one.
  const targets = topicOptions.filter((t) => t.id !== currentTopicId);
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
                <div className="ml-auto flex shrink-0 items-baseline gap-3">
                  <MoveMenu
                    url={url}
                    targets={targets}
                    onSnapshotReplaced={onSnapshotReplaced}
                  />
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Per-source "Move →" affordance: a muted button that opens a small menu of the
// other leaf topics. Selecting one calls moveArticle; the backend returns the
// full re-derived snapshot, which we lift to page state via onSnapshotReplaced
// so every affected topic, card, and source list updates at once. Plain
// controlled-open state — closes on outside click, Escape, or a successful move.
function MoveMenu({
  url,
  targets,
  onSnapshotReplaced,
}: {
  url: string;
  targets: TopicOption[];
  onSnapshotReplaced: (snapshot: PipelineResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (targets.length === 0) return null;

  async function moveTo(topicId: string) {
    if (busy) return;
    setBusy(true);
    const res = await moveArticle(url, topicId);
    setBusy(false);
    if (res.ok) onSnapshotReplaced(res.snapshot);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy ? "Moving…" : "Move →"}
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-10 mt-1.5 max-h-64 w-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg shadow-black/10"
        >
          <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Move to
          </p>
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => moveTo(t.id)}
              className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-[var(--ink)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] hover:text-[var(--accent)]"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Full lesson prose at reading measure. The script is markdown (bold, bullets,
// paragraphs); we render it with explicit element styling — no `prose` plugin —
// so it stays in the warm serif editorial voice instead of looking like default
// GitHub markdown.
export function LessonProse({ script }: { script: string }) {
  return (
    <div className="max-w-[68ch] font-serif text-[17px] leading-relaxed text-[var(--ink)]">
      <ReactMarkdown components={lessonProseComponents}>{script}</ReactMarkdown>
    </div>
  );
}

// Element overrides keep the markdown in the editorial system: serif body,
// CSS-token colors, generous-but-restrained spacing, real disc bullets.
const lessonProseComponents = {
  p: ({ ...props }) => <p className="mt-4 first:mt-0" {...props} />,
  strong: ({ ...props }) => (
    <strong className="font-semibold text-[var(--ink)]" {...props} />
  ),
  em: ({ ...props }) => <em className="italic" {...props} />,
  ul: ({ ...props }) => (
    <ul className="mt-4 list-disc space-y-1.5 pl-5" {...props} />
  ),
  ol: ({ ...props }) => (
    <ol className="mt-4 list-decimal space-y-1.5 pl-5" {...props} />
  ),
  li: ({ ...props }) => <li className="pl-1 marker:text-[var(--muted)]" {...props} />,
  h1: ({ ...props }) => (
    <h2
      className="mt-6 font-serif text-2xl font-semibold tracking-tight text-[var(--ink)] first:mt-0"
      {...props}
    />
  ),
  h2: ({ ...props }) => (
    <h2
      className="mt-6 font-serif text-xl font-semibold tracking-tight text-[var(--ink)] first:mt-0"
      {...props}
    />
  ),
  h3: ({ ...props }) => (
    <h3
      className="mt-5 font-serif text-lg font-semibold tracking-tight text-[var(--ink)] first:mt-0"
      {...props}
    />
  ),
  a: ({ ...props }) => (
    <a
      className="text-[var(--accent)] underline underline-offset-2 transition-opacity hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: ({ ...props }) => (
    <blockquote
      className="mt-4 border-l-2 border-[var(--border)] pl-4 italic text-[var(--muted)]"
      {...props}
    />
  ),
};

function lastSentence(text: string): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return text.trim();
  return parts[parts.length - 1].trim();
}
