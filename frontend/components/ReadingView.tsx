"use client";

import { useState } from "react";
import type { Article, Lesson, PipelineResponse, TopicNode } from "@/lib/types";
import LessonCard from "./LessonCard";

// The home tab: topic-grouped article rows + a play-able lesson per topic.
// Top-level groups = root.children. Sub-topics (depth 2) nest as sub-groups.
export default function ReadingView({
  data,
  lessonByTopic,
  articleByUrl,
  focusTopicId,
  registerTopicRef,
}: {
  data: PipelineResponse;
  lessonByTopic: Map<string, Lesson>;
  articleByUrl: Map<string, Article>;
  focusTopicId: string | null;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
}) {
  const tops = data.topics.children;

  if (tops.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <p className="font-serif text-xl text-[var(--ink)]">Your stack is empty</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Add a link or load the demo corpus to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {tops.map((topic) => (
        <TopicGroup
          key={topic.id}
          topic={topic}
          lessonByTopic={lessonByTopic}
          articleByUrl={articleByUrl}
          focusTopicId={focusTopicId}
          registerTopicRef={registerTopicRef}
        />
      ))}
    </div>
  );
}

function TopicGroup({
  topic,
  lessonByTopic,
  articleByUrl,
  focusTopicId,
  registerTopicRef,
}: {
  topic: TopicNode;
  lessonByTopic: Map<string, Lesson>;
  articleByUrl: Map<string, Article>;
  focusTopicId: string | null;
  registerTopicRef: (id: string, el: HTMLElement | null) => void;
}) {
  // A topic's own lesson (if it's a leaf), plus any sub-topic lessons rendered
  // under their sub-group headers.
  const ownLesson = lessonByTopic.get(topic.id) ?? null;
  const count = totalArticleCount(topic);
  const focused = focusTopicId === topic.id;

  return (
    <section
      ref={(el) => registerTopicRef(topic.id, el)}
      className={[
        "scroll-mt-20 space-y-3 rounded-2xl px-1 transition-colors",
        focused ? "ring-1 ring-[var(--accent)]" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-3">
        <h2 className="font-serif text-xl font-semibold text-[var(--ink)]">
          {topic.label}
        </h2>
        <span className="text-xs text-[var(--muted)]">
          {count} {count === 1 ? "article" : "articles"}
        </span>
        {ownLesson && (
          <span className="text-xs text-[var(--accent)]">🎧 ▶ lesson</span>
        )}
      </div>

      <ArticleRows urls={topic.article_urls} articleByUrl={articleByUrl} />

      {ownLesson && (
        <div className="pt-1">
          <LessonCard lesson={ownLesson} topic={topic} />
        </div>
      )}

      {/* Sub-topics nest under their parent as sub-groups. */}
      {topic.children.map((sub) => {
        const subLesson = lessonByTopic.get(sub.id) ?? null;
        return (
          <div
            key={sub.id}
            ref={(el) => registerTopicRef(sub.id, el)}
            className="scroll-mt-20 space-y-2 border-l border-[var(--border)] pl-4"
          >
            <div className="flex items-baseline gap-3">
              <h3 className="font-serif text-base font-semibold text-[var(--ink)]">
                {sub.label}
              </h3>
              <span className="text-xs text-[var(--muted)]">
                {sub.article_urls.length}
              </span>
              {subLesson && (
                <span className="text-xs text-[var(--accent)]">🎧 ▶ lesson</span>
              )}
            </div>
            <ArticleRows
              urls={sub.article_urls}
              articleByUrl={articleByUrl}
            />
            {subLesson && (
              <div className="pt-1">
                <LessonCard lesson={subLesson} topic={sub} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ArticleRows({
  urls,
  articleByUrl,
}: {
  urls: string[];
  articleByUrl: Map<string, Article>;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="divide-y divide-[var(--border)]">
      {urls.map((url) => {
        const article = articleByUrl.get(url);
        const title = article?.title ?? url;
        return (
          <div key={url} className="flex items-baseline gap-3 py-3">
            <span className="font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent)]">
              {title}
            </span>
            <span className="text-xs text-[var(--muted)]">{hostOf(url)}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
            >
              Open ↗
            </a>
          </div>
        );
      })}
    </div>
  );
}

function totalArticleCount(topic: TopicNode): number {
  return (
    topic.article_urls.length +
    topic.children.reduce((s, c) => s + totalArticleCount(c), 0)
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}
