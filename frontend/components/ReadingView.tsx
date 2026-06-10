"use client";

import { useMemo, useState } from "react";
import type { Article, Lesson, PipelineResponse } from "@/lib/types";
import {
  deriveLessonItems,
  firstSentences,
  pickFeatured,
  type LessonItem,
} from "@/lib/lessons";
import {
  AudioPlayer,
  LengthPicker,
  LessonProse,
  SourceList,
  VerifiedBadge,
} from "./LessonCard";

// The home tab, reframed: playable lessons are the hero, articles are demoted
// to collapsible "sources". Your backlog -> open a lesson -> hit play.
export default function ReadingView({
  data,
  lessonByTopic,
  articleByUrl,
  registerTopicRef,
  onLessonUpdated,
}: {
  data: PipelineResponse;
  lessonByTopic: Map<string, Lesson>;
  articleByUrl: Map<string, Article>;
  focusTopicId: string | null;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
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
          registerTopicRef={registerTopicRef}
          onLessonUpdated={onLessonUpdated}
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
                registerTopicRef={registerTopicRef}
                onLessonUpdated={onLessonUpdated}
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
  registerTopicRef,
  onLessonUpdated,
}: {
  item: LessonItem;
  articleByUrl: Map<string, Article>;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
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
          <h1 className="mt-1.5 font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]">
            {item.title}
          </h1>
        </div>
        <VerifiedBadge lesson={item.lesson} />
      </div>

      <div className="mb-5">
        <AudioPlayer lesson={item.lesson} prominent />
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
  registerTopicRef,
  onLessonUpdated,
}: {
  item: LessonItem;
  articleByUrl: Map<string, Article>;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
  onLessonUpdated: (updated: Lesson) => void;
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
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex flex-col items-start gap-2 text-left"
      >
        <div className="flex w-full items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-[var(--ink)]">
            {item.title}
          </h2>
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
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {synthesis}
        </p>
      </button>

      <div className="mt-3">
        <VerifiedBadge lesson={item.lesson} />
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
          <AudioPlayer lesson={item.lesson} prominent />
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
        />
      </div>
    </section>
  );
}
