"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineResponse } from "@/lib/types";
import { buildStack } from "@/lib/api";
import { MOCK } from "@/lib/mock";
import { indexTopics, leafTopics } from "@/lib/layout";
import AddLinksPanel from "@/components/AddLinksPanel";
import TopicGraph from "@/components/TopicGraph";
import LessonCard from "@/components/LessonCard";
import MetricPanel from "@/components/MetricPanel";

export default function Home() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const lessonRef = useRef<HTMLDivElement>(null);

  // Derived structures from the current pipeline result.
  const topicIndex = useMemo(
    () => (data ? indexTopics(data.topics) : null),
    [data]
  );
  const leaves = useMemo(() => (data ? leafTopics(data.topics) : []), [data]);
  const lessonByTopic = useMemo(() => {
    const m = new Map<string, PipelineResponse["lessons"][number]>();
    data?.lessons.forEach((l) => m.set(l.topic_id, l));
    return m;
  }, [data]);

  // The selected lesson resolves to the chosen topic, falling back to the
  // first leaf so the card is never empty.
  const activeTopicId = selectedTopicId ?? leaves[0]?.id ?? null;
  const activeTopic = activeTopicId
    ? (topicIndex?.get(activeTopicId) ?? null)
    : null;
  const activeLesson = activeTopicId
    ? (lessonByTopic.get(activeTopicId) ?? null)
    : null;

  async function run(urls: string[]) {
    setLoading(true);
    setSelectedTopicId(null);
    const { data: result, usedMock: mock } = await buildStack(urls);
    setData(result);
    setUsedMock(mock);
    setLoading(false);
  }

  // Seed the page with the mock on first load so it's never an empty canvas.
  useEffect(() => {
    setData(MOCK);
    setUsedMock(true);
  }, []);

  function selectTopic(id: string) {
    setSelectedTopicId(id);
    lessonRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-teal-400 to-sky-500" />
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            ReadStack
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Turn your saved-link backlog into a topic graph and grounded
          bite-size lessons —{" "}
          <span className="text-slate-300">
            cheap models do the volume work, strong models only touch what you
            read.
          </span>
        </p>
      </header>

      {/* Top row: inputs + metric panel side by side on wide screens */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <AddLinksPanel onBuild={run} loading={loading} />
        {data && <MetricPanel metrics={data.metrics} />}
      </div>

      {usedMock && (
        <p className="mt-3 text-[11px] text-slate-500">
          Showing sample data — connect the pipeline backend to process live
          links.
        </p>
      )}

      {/* Topic graph */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Topic graph
          </h2>
          {data && (
            <span className="text-xs text-slate-500">
              {data.articles.length} articles · click a topic to read its lesson
            </span>
          )}
        </div>
        <div className="relative h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
          {loading ? (
            <LoadingCanvas />
          ) : data ? (
            <TopicGraph
              root={data.topics}
              selectedId={activeTopicId}
              onSelect={selectTopic}
            />
          ) : null}
        </div>
      </section>

      {/* Lesson view */}
      <section className="mt-8" ref={lessonRef}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Lessons
          </h2>
          {/* Quick chips to jump between leaf-topic lessons */}
          {leaves.map((leaf) => {
            const active = leaf.id === activeTopicId;
            return (
              <button
                key={leaf.id}
                type="button"
                onClick={() => selectTopic(leaf.id)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  active
                    ? "border-teal-400/70 bg-teal-500/10 text-teal-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200",
                ].join(" ")}
              >
                {leaf.label}
              </button>
            );
          })}
        </div>
        <LessonCard lesson={activeLesson} topic={activeTopic} />
      </section>

      <footer className="mt-12 border-t border-slate-800 pt-5 text-xs text-slate-600">
        ReadStack · AI Inference Hack Day · Akamai AI Inference Cloud
      </footer>
    </main>
  );
}

function LoadingCanvas() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-teal-400" />
      <p className="text-sm">routing across Akamai tiers…</p>
      <p className="text-xs text-slate-600">
        tagging · embedding · clustering · drafting · verifying
      </p>
    </div>
  );
}
