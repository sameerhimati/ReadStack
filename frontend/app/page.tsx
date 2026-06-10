"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, Lesson, PipelineResponse, TopicNode } from "@/lib/types";
import { buildStack, fetchSnapshot } from "@/lib/api";
import { deriveTopicOptions } from "@/lib/lessons";
import { MOCK } from "@/lib/mock";
import Nav, { type Tab } from "@/components/Nav";
import ReadingView from "@/components/ReadingView";
import TopicGraph from "@/components/TopicGraph";
import MetricPanel from "@/components/MetricPanel";
import AddLinksPanel from "@/components/AddLinksPanel";
import Reader from "@/components/Reader";

export default function Home() {
  const [data, setData] = useState<PipelineResponse>(MOCK);
  const [usedMock, setUsedMock] = useState(true);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("reading");
  const [addOpen, setAddOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [focusTopicId, setFocusTopicId] = useState<string | null>(null);
  // The article currently open in the in-app reader slide-over (null = closed).
  const [openArticleUrl, setOpenArticleUrl] = useState<string | null>(null);

  // Topic section refs so Map clicks can scroll the Reading list.
  const topicRefs = useRef(new Map<string, HTMLElement>());
  const registerTopicRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) topicRefs.current.set(id, el);
    else topicRefs.current.delete(id);
  }, []);

  // Sync the theme toggle with the class the no-FOUC script already set.
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  // On load, pull the cached snapshot (no backend inference). MOCK stays as the
  // first paint and the fallback if the backend isn't reachable.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: snap, usedMock: mock } = await fetchSnapshot();
      if (alive && !mock) {
        setData(snap);
        setUsedMock(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setIsDark(next);
  };

  // Derived lookups.
  const lessonByTopic = useMemo(() => {
    const m = new Map<string, Lesson>();
    data.lessons.forEach((l) => m.set(l.topic_id, l));
    return m;
  }, [data]);

  const articleByUrl = useMemo(() => {
    const m = new Map<string, Article>();
    data.articles.forEach((a) => m.set(a.url, a));
    return m;
  }, [data]);

  // The leaf topics curation menus target (Move-to, Add-link picker).
  const topicOptions = useMemo(
    () => deriveTopicOptions(data, lessonByTopic),
    [data, lessonByTopic]
  );

  async function loadCorpus() {
    setLoading(true);
    const { data: result, usedMock: mock } = await buildStack([]);
    setData(result);
    setUsedMock(mock);
    setLoading(false);
    setAddOpen(false);
    setTab("reading");
  }

  // Optimistic add: jump to Reading and flag the topic the link likely joins.
  // The real topic assignment lands when the pipeline reprocesses; until then
  // we just surface the Reading tab so the user sees their stack.
  function handleAdded() {
    setTab("reading");
  }

  // Replace a regenerated lesson in the page-level source of truth, matched by
  // topic_id. This is what makes a length change persist: lessonByTopic and the
  // rendered markdown both derive from `data`, so swapping the lesson here flows
  // the new script through LessonProse on the next render.
  const handleLessonUpdated = useCallback((updated: Lesson) => {
    setData((prev) => ({
      ...prev,
      lessons: prev.lessons.map((l) =>
        l.topic_id === updated.topic_id ? updated : l
      ),
    }));
  }, []);

  // Rename a topic in place: walk the tree and set the matching node's label.
  // Since the lesson cards, the home list titles, and the topic graph all derive
  // from `data.topics`, updating the node here flows the new label everywhere on
  // the next render. Pure metadata — no lessons or articles change.
  const handleTopicRenamed = useCallback((topicId: string, label: string) => {
    const relabel = (node: TopicNode): TopicNode => {
      const next = node.id === topicId ? { ...node, label } : node;
      if (next.children.length === 0) return next;
      return { ...next, children: next.children.map(relabel) };
    };
    setData((prev) => ({ ...prev, topics: relabel(prev.topics) }));
  }, []);

  // Replace the whole page source of truth with a server snapshot. Used after an
  // article move, where the backend already re-derived every affected topic.
  const handleSnapshotReplaced = useCallback((snapshot: PipelineResponse) => {
    setData(snapshot);
  }, []);

  function focusTopic(id: string) {
    setTab("reading");
    setFocusTopicId(id);
    // Defer scroll until the Reading view has mounted.
    requestAnimationFrame(() => {
      topicRefs.current
        .get(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.setTimeout(() => setFocusTopicId(null), 1600);
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <Nav
        tab={tab}
        onTab={setTab}
        onAdd={() => setAddOpen(true)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        {usedMock && (
          <p className="mb-6 text-xs text-[var(--muted)]">
            Showing sample data — connect the pipeline backend to process live
            links.
          </p>
        )}

        {tab === "reading" && (
          <ReadingView
            data={data}
            lessonByTopic={lessonByTopic}
            articleByUrl={articleByUrl}
            topicOptions={topicOptions}
            focusTopicId={focusTopicId}
            registerTopicRef={registerTopicRef}
            onLessonUpdated={handleLessonUpdated}
            onTopicRenamed={handleTopicRenamed}
            onSnapshotReplaced={handleSnapshotReplaced}
            onReadArticle={setOpenArticleUrl}
          />
        )}

        {tab === "map" && (
          <section className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {data.articles.length} articles · click a topic to read it
            </p>
            <div className="relative h-[480px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <TopicGraph
                root={data.topics}
                selectedId={focusTopicId}
                onSelect={focusTopic}
              />
            </div>
          </section>
        )}

        {tab === "inference" && <MetricPanel metrics={data.metrics} />}
      </main>

      <AddLinksPanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
        onLoadDemo={loadCorpus}
        loading={loading}
        topicOptions={topicOptions}
      />

      <Reader url={openArticleUrl} onClose={() => setOpenArticleUrl(null)} />
    </div>
  );
}
