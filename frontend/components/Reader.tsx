"use client";

import { useEffect, useState } from "react";
import { fetchArticle, mediaUrl, type ArticleContent } from "@/lib/api";
import { hostOf } from "@/lib/lessons";

// In-app article reader: a slide-over panel that shows a saved article's
// extracted text instead of opening it in a new tab. Controlled by the
// page-level `openArticleUrl` — non-null mounts the panel and triggers a fetch.
// `text` is plain Readability output (paragraphs split on blank lines), so it's
// rendered as <p> blocks in the editorial serif measure — never markdown.
export default function Reader({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const [article, setArticle] = useState<ArticleContent | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );

  // Fetch (re)whenever the url changes. A stale guard prevents an earlier,
  // slower request from overwriting a newer one if the user opens another
  // source mid-flight.
  useEffect(() => {
    if (!url) {
      setArticle(null);
      setStatus("idle");
      return;
    }
    let alive = true;
    setArticle(null);
    setStatus("loading");
    (async () => {
      const res = await fetchArticle(url);
      if (!alive) return;
      if (res.ok) {
        setArticle(res.article);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  // Close on Escape and lock body scroll while the panel is open.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [url, onClose]);

  if (!url) return null;

  const paragraphs = article
    ? article.text
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+\n/g, " ").trim())
        .filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed backdrop — click to dismiss. */}
      <button
        type="button"
        aria-label="Close reader"
        onClick={onClose}
        className="animate-reader-fade absolute inset-0 bg-black/30 backdrop-blur-sm"
      />

      {/* The panel — slides in from the right, full height. */}
      <aside
        role="dialog"
        aria-modal="true"
        className="animate-reader-slide-in relative flex h-full w-[min(640px,92vw)] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-lg shadow-black/10"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 md:px-8">
          <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Reading
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1.5 rounded p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
          {status === "loading" && (
            <p className="text-sm italic text-[var(--muted)]">
              Fetching the article…
            </p>
          )}

          {status === "error" && (
            <div className="text-sm text-[var(--muted)]">
              <p className="text-[var(--ink)]">
                Couldn&apos;t load this article.
              </p>
              <p className="mt-1">
                It may be behind a paywall or unreachable. You can still{" "}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] underline underline-offset-2 transition-opacity hover:opacity-80"
                >
                  open the original ↗
                </a>
                .
              </p>
            </div>
          )}

          {status === "ok" && article && (
            <article className="max-w-[68ch]">
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]">
                {article.title}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--muted)]">
                {hostOf(url) && <span>{hostOf(url)}</span>}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[var(--accent)]"
                >
                  Open original ↗
                </a>
              </div>

              {article.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <ListenArea media={article.media} />

              <div className="mt-6 font-serif text-[17px] leading-relaxed text-[var(--ink)]">
                {paragraphs.length > 0 ? (
                  paragraphs.map((p, i) => (
                    <p key={i} className="mt-4 first:mt-0">
                      {p}
                    </p>
                  ))
                ) : (
                  <p className="italic text-[var(--muted)]">
                    No readable text was extracted from this article.
                  </p>
                )}
              </div>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
}

// The per-article media affordance, mirroring LessonCard's AudioPlayer pattern:
// when an asset exists, a compact native player with a small muted caption;
// when none of the three exist, a single honest "coming soon" pill. Players are
// editorial and compact — full-width audio, a contained video clip.
function ListenArea({ media }: { media?: ArticleContent["media"] }) {
  const audioSummary = media?.audio_summary;
  const audioFull = media?.audio_full;
  const video = media?.video;

  if (!audioSummary && !audioFull && !video) {
    return (
      <div className="mt-5">
        <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--muted)]">
          ▶ Audio coming soon
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
      {audioSummary && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Summary
          </p>
          <audio
            controls
            preload="none"
            src={mediaUrl(audioSummary)}
            className="w-full"
          />
        </div>
      )}
      {audioFull && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Full narration
          </p>
          <audio
            controls
            preload="none"
            src={mediaUrl(audioFull)}
            className="w-full"
          />
        </div>
      )}
      {video && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            Video
          </p>
          <video
            controls
            preload="none"
            src={mediaUrl(video)}
            className="w-full rounded-md border border-[var(--border)]"
          />
        </div>
      )}
    </div>
  );
}
