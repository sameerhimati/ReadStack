"use client";

import type { Lesson, TopicNode } from "@/lib/types";
import { API_URL } from "@/lib/api";

export default function LessonCard({
  lesson,
  topic,
}: {
  lesson: Lesson | null;
  topic: TopicNode | null;
}) {
  if (!lesson || !topic) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Select a topic in the graph to read its lesson.
      </div>
    );
  }

  const grounded = lesson.grounded;
  const scorePct = Math.round(lesson.grounding_score * 100);

  return (
    <article className="animate-fade-up rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Lesson
          </p>
          <h3 className="text-lg font-semibold text-slate-100">
            {topic.label}
          </h3>
        </div>

        {/* Grounding badge — green if grounded, amber if a claim was flagged */}
        <div
          className={[
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
            grounded
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              grounded ? "bg-emerald-400" : "bg-amber-400",
            ].join(" ")}
          />
          {grounded ? "Grounded ✓" : "Unsupported claim flagged"}
          <span className="tabular-nums opacity-70">· {scorePct}%</span>
        </div>
      </header>

      <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-300">
        {lesson.script}
      </p>

      {/* Audio slot */}
      <div className="mt-5 border-t border-slate-800 pt-4">
        {lesson.audio_path ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Narration
            </p>
            <audio
              controls
              preload="none"
              src={`${API_URL}${lesson.audio_path}`}
              className="w-full"
            />
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-slate-700 bg-slate-800/40 px-4 py-1.5 text-xs font-medium text-slate-500"
          >
            ▶ Audio (coming soon)
          </button>
        )}
      </div>
    </article>
  );
}
