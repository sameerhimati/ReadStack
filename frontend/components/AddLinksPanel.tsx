"use client";

import { useState } from "react";

export default function AddLinksPanel({
  onBuild,
  loading,
}: {
  onBuild: (urls: string[]) => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");

  const parseUrls = (raw: string) =>
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

  const submit = () => {
    if (loading) return;
    const urls = parseUrls(text);
    onBuild(urls); // empty is fine — backend/mock handles it
  };

  const loadDemo = () => {
    // Empty list -> the backend builds from its own curated data/urls.txt, so the
    // demo always reflects the validated corpus (single source of truth).
    onBuild([]);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <label
        htmlFor="links"
        className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
      >
        Your saved links — one URL per line
      </label>
      <textarea
        id="links"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"https://...\nhttps://...\nhttps://..."}
        rows={6}
        spellCheck={false}
        disabled={loading}
        className="w-full resize-y rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-[13px] text-slate-200 placeholder:text-slate-600 outline-none transition focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Spinner />
              routing across Akamai tiers…
            </>
          ) : (
            "Build my stack"
          )}
        </button>
        <button
          type="button"
          onClick={loadDemo}
          disabled={loading}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Load demo corpus
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950"
    />
  );
}
