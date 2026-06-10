"use client";

import { useEffect, useState } from "react";
import { addUrl } from "@/lib/api";

// Small modal to add a single link. POSTs {url} to /add and reports back so the
// page can optimistically show it landing. "Load demo corpus" reruns /pipeline
// with the backend's curated set. Friendly states, never lorem.
export default function AddLinksPanel({
  open,
  onClose,
  onAdded,
  onLoadDemo,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (url: string) => void;
  onLoadDemo: () => void;
  loading: boolean;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "adding" | "ok" | "error">(
    "idle"
  );

  // Reset transient state each time the sheet opens.
  useEffect(() => {
    if (open) {
      setUrl("");
      setStatus("idle");
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus("adding");
    try {
      await addUrl(trimmed);
      setStatus("ok");
      onAdded(trimmed);
      setTimeout(onClose, 600);
    } catch {
      // The /add endpoint may not be live yet — still show it optimistically.
      setStatus("error");
      onAdded(trimmed);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-6 pt-28 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg shadow-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl font-semibold text-[var(--ink)]">
          Add a link
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Drop a URL and we&apos;ll slot it into your stack.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            type="url"
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="https://…"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={status === "adding" || !url.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {status === "adding" ? "Adding…" : "Add"}
          </button>
        </div>

        {status === "ok" && (
          <p className="mt-3 text-xs text-[var(--verified)]">
            Added — finding its place in your stack.
          </p>
        )}
        {status === "error" && (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Saved locally — it&apos;ll be processed when the pipeline is live.
          </p>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={onLoadDemo}
            disabled={loading}
            className="text-sm text-[var(--accent)] transition-colors hover:underline disabled:opacity-50"
          >
            {loading ? "Loading corpus…" : "Load demo corpus"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
