"use client";

import type { Metrics, Tier } from "@/lib/types";

const TIER_META: Record<
  Tier,
  { label: string; sub: string; bar: string; dot: string; cheap: boolean }
> = {
  embed: {
    label: "Embed",
    sub: "vectorize",
    bar: "bg-emerald-500",
    dot: "bg-emerald-400",
    cheap: true,
  },
  weak: {
    label: "Weak · 8B",
    sub: "tag · cluster · verify",
    bar: "bg-teal-500",
    dot: "bg-teal-400",
    cheap: true,
  },
  mid: {
    label: "Mid",
    sub: "lesson draft",
    bar: "bg-amber-500",
    dot: "bg-amber-400",
    cheap: false,
  },
  strong: {
    label: "Strong",
    sub: "hard cases",
    bar: "bg-rose-500",
    dot: "bg-rose-400",
    cheap: false,
  },
};

const TIER_ORDER: Tier[] = ["embed", "weak", "mid", "strong"];

export default function MetricPanel({ metrics }: { metrics: Metrics }) {
  const { calls_by_tier, total_calls, savings_x, grounding } = metrics;
  const total = total_calls || TIER_ORDER.reduce((s, t) => s + calls_by_tier[t], 0);

  const cheapShare =
    total > 0
      ? Math.round(((calls_by_tier.embed + calls_by_tier.weak) / total) * 100)
      : 0;

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-teal-300/80">
            The inference choice
          </p>
          <h2 className="text-base font-semibold text-slate-100">
            Where the calls actually went
          </h2>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold leading-none text-teal-300 tabular-nums">
            ≈{savings_x}×
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            cheaper than all-frontier
          </div>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-800">
        {TIER_ORDER.map((t) => {
          const pct = total > 0 ? (calls_by_tier[t] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={t}
              className={`${TIER_META[t].bar} h-full transition-all`}
              style={{ width: `${pct}%` }}
              title={`${TIER_META[t].label}: ${calls_by_tier[t]} calls`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {TIER_ORDER.map((t) => (
          <div key={t} className="flex items-start gap-2">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TIER_META[t].dot}`}
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-slate-100 tabular-nums">
                  {calls_by_tier[t]}
                </span>
                <span className="truncate text-xs text-slate-300">
                  {TIER_META[t].label}
                </span>
              </div>
              <div className="truncate text-[11px] text-slate-500">
                {TIER_META[t].sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Headline numbers */}
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-800 pt-5">
        <Stat value={total_calls.toString()} label="total calls" />
        <Stat value={`${cheapShare}%`} label="on the cheap tier" />
        <Stat
          value={`${grounding.unsupported_caught}/${grounding.checked}`}
          label="unsupported caught"
        />
      </div>

      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        Most calls hit the cheap 8B on an Akamai edge GPU — right model, right
        GPU, per task.
      </p>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold leading-none text-slate-100 tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
