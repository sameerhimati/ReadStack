"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Article, Lesson, PipelineResponse } from "@/lib/types";
import { renameTopic } from "@/lib/api";
import {
  deriveLessonItems,
  firstSentences,
  pickFeatured,
  type LessonItem,
  type TopicOption,
} from "@/lib/lessons";
import {
  AudioPlayer,
  LengthPicker,
  LessonProse,
  LessonVideo,
  SourceList,
  VerifiedBadge,
} from "./LessonCard";

// The home tab, reframed: playable lessons are the hero, articles are demoted
// to collapsible "sources". Your backlog -> open a lesson -> hit play.
export default function ReadingView({
  data,
  lessonByTopic,
  articleByUrl,
  topicOptions,
  registerTopicRef,
  onLessonUpdated,
  onTopicRenamed,
  onSnapshotReplaced,
  onReadArticle,
}: {
  data: PipelineResponse;
  lessonByTopic: Map<string, Lesson>;
  articleByUrl: Map<string, Article>;
  topicOptions: TopicOption[];
  focusTopicId: string | null;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
  onTopicRenamed: (topicId: string, label: string) => void;
  onSnapshotReplaced: (snapshot: PipelineResponse) => void;
  onReadArticle: (url: string) => void;
}) {
  const items = useMemo(
    () => deriveLessonItems(data, lessonByTopic),
    [data, lessonByTopic]
  );
  const featured = useMemo(() => pickFeatured(items), [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <p className="font-serif text-xl text-[var(--ink)]">
          Your stack is empty
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Add a link or load the demo corpus to get started.
        </p>
      </div>
    );
  }

  const rest = items.filter((it) => it.id !== featured?.id);

  return (
    <div className="space-y-10">
      {featured && (
        <FeaturedLesson
          item={featured}
          articleByUrl={articleByUrl}
          topicOptions={topicOptions}
          registerTopicRef={registerTopicRef}
          onLessonUpdated={onLessonUpdated}
          onTopicRenamed={onTopicRenamed}
          onSnapshotReplaced={onSnapshotReplaced}
          onReadArticle={onReadArticle}
        />
      )}

      {rest.length > 0 && (
        <section className="space-y-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            More from your stack
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {rest.map((item) => (
              <LessonListCard
                key={item.id}
                item={item}
                articleByUrl={articleByUrl}
                topicOptions={topicOptions}
                registerTopicRef={registerTopicRef}
                onLessonUpdated={onLessonUpdated}
                onTopicRenamed={onTopicRenamed}
                onSnapshotReplaced={onSnapshotReplaced}
                onReadArticle={onReadArticle}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// The immediate wow on load: a large card, the audio player front and center,
// a serif title, a two-sentence lead, the Verified badge, and sources tucked
// behind a toggle.
function FeaturedLesson({
  item,
  articleByUrl,
  topicOptions,
  registerTopicRef,
  onLessonUpdated,
  onTopicRenamed,
  onSnapshotReplaced,
  onReadArticle,
}: {
  item: LessonItem;
  articleByUrl: Map<string, Article>;
  topicOptions: TopicOption[];
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
  onTopicRenamed: (topicId: string, label: string) => void;
  onSnapshotReplaced: (snapshot: PipelineResponse) => void;
  onReadArticle: (url: string) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lead = firstSentences(item.lesson.script, 2);

  return (
    <section
      ref={(el) => {
        registerTopicRef(item.id, el);
        if (item.topId !== item.id) registerTopicRef(item.topId, el);
      }}
      className="scroll-mt-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 md:p-8"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[var(--accent)]">
            Now playing from your stack
          </p>
          <EditableTitle
            topicId={item.id}
            label={item.title}
            onTopicRenamed={onTopicRenamed}
            className="mt-1.5 font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]"
            as="h1"
          />
        </div>
        <VerifiedBadge lesson={item.lesson} />
      </div>

      <div className="mb-5 space-y-3">
        <AudioPlayer
          lesson={item.lesson}
          prominent
          onLessonUpdated={onLessonUpdated}
        />
        <LessonVideo lesson={item.lesson} onLessonUpdated={onLessonUpdated} />
      </div>

      {expanded ? (
        <LessonProse script={item.lesson.script} />
      ) : (
        <p className="max-w-[68ch] font-serif text-[17px] leading-relaxed text-[var(--ink)]">
          {lead}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-[var(--accent)] transition-colors hover:opacity-80"
        >
          {expanded ? "Show less" : "Read the lesson"}
        </button>
        <SourceList
          urls={item.articleUrls}
          articleByUrl={articleByUrl}
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((v) => !v)}
          currentTopicId={item.id}
          topicOptions={topicOptions}
          onSnapshotReplaced={onSnapshotReplaced}
          onReadArticle={onReadArticle}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Length
          </span>
          <LengthPicker lesson={item.lesson} onLessonUpdated={onLessonUpdated} />
        </div>
      </div>
    </section>
  );
}

// One playable lesson in the secondary list. Click the card to expand the full
// prose inline; the ▶ / synthesis / Verified badge / sources read at a glance.
function LessonListCard({
  item,
  articleByUrl,
  topicOptions,
  registerTopicRef,
  onLessonUpdated,
  onTopicRenamed,
  onSnapshotReplaced,
  onReadArticle,
}: {
  item: LessonItem;
  articleByUrl: Map<string, Article>;
  topicOptions: TopicOption[];
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
  onTopicRenamed: (topicId: string, label: string) => void;
  onSnapshotReplaced: (snapshot: PipelineResponse) => void;
  onReadArticle: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const synthesis = firstSentences(item.lesson.script, 1);
  const hasAudio = !!item.lesson.audio_path;

  return (
    <section
      ref={(el) => {
        registerTopicRef(item.id, el);
        if (item.topId !== item.id) registerTopicRef(item.topId, el);
      }}
      className="scroll-mt-20 flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[color-mix(in_oklab,var(--accent)_40%,var(--border))]"
    >
      <div className="flex flex-col items-start gap-2">
        <div className="flex w-full items-start justify-between gap-3">
          <EditableTitle
            topicId={item.id}
            label={item.title}
            onTopicRenamed={onTopicRenamed}
            className="font-serif text-xl font-semibold text-[var(--ink)]"
            as="h2"
          />
          {hasAudio ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
              ▶ Play
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
              Listen soon
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-left text-sm leading-relaxed text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          {synthesis}
        </button>
      </div>

      <div className="mt-3">
        <VerifiedBadge lesson={item.lesson} />
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
          <AudioPlayer
            lesson={item.lesson}
            prominent
            onLessonUpdated={onLessonUpdated}
          />
          <LessonVideo lesson={item.lesson} onLessonUpdated={onLessonUpdated} />
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              Length
            </span>
            <LengthPicker lesson={item.lesson} onLessonUpdated={onLessonUpdated} />
          </div>
          <LessonProse script={item.lesson.script} />
        </div>
      )}

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <SourceList
          urls={item.articleUrls}
          articleByUrl={articleByUrl}
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((v) => !v)}
          currentTopicId={item.id}
          topicOptions={topicOptions}
          onSnapshotReplaced={onSnapshotReplaced}
          onReadArticle={onReadArticle}
        />
      </div>
    </section>
  );
}

// Inline-edit a topic label, rendered as the lesson card heading. Idle: the
// title with a muted pencil that fades in on hover. Editing: a text input
// pre-filled with the current label — Enter or blur commits via renameTopic,
// Escape cancels. On success the new label is lifted to page state via
// onTopicRenamed so the card, the home list, and the topic graph all update.
function EditableTitle({
  topicId,
  label,
  onTopicRenamed,
  className,
  as,
}: {
  topicId: string;
  label: string;
  onTopicRenamed: (topicId: string, label: string) => void;
  className: string;
  as: "h1" | "h2";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against blur firing after Escape/Enter has already resolved.
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      setDraft(label);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, label]);

  async function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    if (!next || next === label) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const res = await renameTopic(topicId, next);
    setBusy(false);
    if (res.ok) onTopicRenamed(topicId, res.label);
    setEditing(false);
  }

  function cancel() {
    committedRef.current = true;
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        autoFocus
        disabled={busy}
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        className={[
          className,
          "w-full min-w-0 rounded-md border border-[var(--accent)] bg-[var(--paper)] px-2 py-0.5 outline-none disabled:opacity-60",
        ].join(" ")}
      />
    );
  }

  const Tag = as;
  return (
    <span className="group/title inline-flex items-center gap-1.5">
      <Tag className={className}>{label}</Tag>
      <button
        type="button"
        aria-label="Rename topic"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="shrink-0 rounded p-1 text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--accent)] focus-visible:opacity-100 group-hover/title:opacity-100"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
    </span>
  );
}
