"use client";

import type { Metrics, Tier } from "@/lib/types";

// Tier colors are semantic: cheap tiers green, mid amber, strong red. The bar
// should read "mostly green" at a glance — that is the thesis.
const TIER_META: Record<
  Tier,
  { label: string; sub: string; color: string }
> = {
  embed: { label: "Embed", sub: "vectorize", color: "var(--verified)" },
  weak: { label: "Weak · 8B", sub: "tag · cluster · verify", color: "var(--verified)" },
  mid: { label: "Mid", sub: "lesson draft", color: "var(--unverified)" },
  strong: { label: "Strong", sub: "hard cases", color: "#c0492e" },
};

const TIER_ORDER: Tier[] = ["embed", "weak", "mid", "strong"];

export default function MetricPanel({ metrics }: { metrics: Metrics }) {
  const { calls_by_tier, total_calls, savings_x, grounding } = metrics;
  const total =
    total_calls || TIER_ORDER.reduce((s, t) => s + calls_by_tier[t], 0);

  const cheapShare =
    total > 0
      ? Math.round(((calls_by_tier.embed + calls_by_tier.weak) / total) * 100)
      : 0;

  return (
    <section className="space-y-8">
      {/* Headline stats */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        <Headline
          value={`≈${savings_x}×`}
          label="cheaper than all-frontier"
        />
        <Headline value={`${cheapShare}%`} label="on the cheap tier" />
        <Headline
          value={`${grounding.unsupported_caught}/${grounding.checked}`}
          label="claims caught"
        />
      </div>

      {/* Where the calls went */}
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Where the calls went
        </p>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
          {TIER_ORDER.map((t) => {
            const pct = total > 0 ? (calls_by_tier[t] / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={t}
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: TIER_META[t].color }}
                title={`${TIER_META[t].label}: ${calls_by_tier[t]} calls`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1 sm:grid-cols-4">
          {TIER_ORDER.map((t) => (
            <div key={t} className="flex items-start gap-2">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TIER_META[t].color }}
              />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {calls_by_tier[t]}
                  </span>
                  <span className="truncate text-xs text-[var(--ink)]">
                    {TIER_META[t].label}
                  </span>
                </div>
                <div className="truncate text-[11px] text-[var(--muted)]">
                  {TIER_META[t].sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        {total_calls} calls total — most hit the cheap 8B on an Akamai edge GPU.
        Right model, right GPU, per task.
      </p>
    </section>
  );
}

function Headline({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--surface)] px-5 py-6">
      <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">
        {value}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}
