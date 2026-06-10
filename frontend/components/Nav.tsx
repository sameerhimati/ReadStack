"use client";

export type Tab = "reading" | "map" | "inference";

const TABS: { id: Tab; label: string }[] = [
  { id: "reading", label: "Reading" },
  { id: "map", label: "Map" },
  { id: "inference", label: "Inference" },
];

export default function Nav({
  tab,
  onTab,
  onAdd,
  isDark,
  onToggleTheme,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onAdd: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--paper)_80%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
        <span className="font-serif text-lg font-semibold tracking-tight text-[var(--ink)]">
          ReadStack
        </span>

        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={[
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === t.id
                  ? "font-medium text-[var(--ink)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            + Add
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="rounded-md px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            {isDark ? "☀" : "🌙"}
          </button>
        </div>
      </div>
    </header>
  );
}
