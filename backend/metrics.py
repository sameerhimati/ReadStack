"""Run metrics — the on-screen evidence for the inference thesis.

Tallies every routing decision by tier, prices the run against an all-strong
baseline, and tracks the grounding catch-rate. Demo-grade: a single module-level
recorder reset at the start of each pipeline run (one user, one request at a
time). tasks.py calls record() right after it calls route(), so the numbers
reflect the real routing policy even while inference is mocked.
"""
from __future__ import annotations

from contracts import Task, Tier

# Real $/call per tier, derived from the actual Claude prices we run on (Anthropic,
# 2026-06): Haiku 4.5 = $1/$5 per 1M in/out tokens, Sonnet 4.6 = $3/$15. The router
# sends the volume tiers (TAG/CLUSTER/VERIFY) to Haiku and the consumable tiers
# (LESSON, escalations) to Sonnet; embeddings run locally on the CPU box, so their
# marginal cost is ~$0. Each per-call figure = representative in/out tokens for that
# tier's typical task at those rates (kept as flat per-call so the metric stays
# simple — the honest story is the cross-tier ratio, now grounded in real prices):
#   WEAK   Haiku  ~1.5k in + ~50 out  -> 1500*$1/1e6 + 50*$5/1e6   ≈ $0.00175
#   MID    Sonnet ~3k in + ~350 out   -> 3000*$3/1e6 + 350*$15/1e6 ≈ $0.0143
#   STRONG Sonnet ~4k in + ~600 out   -> 4000*$3/1e6 + 600*$15/1e6 ≈ $0.021
#   EMBED  local nomic on CPU         -> ~$0 marginal
COST_PER_CALL = {
    Tier.EMBED: 0.0,
    Tier.WEAK: 0.00175,
    Tier.MID: 0.0143,
    Tier.STRONG: 0.021,
}


class _Run:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.calls_by_tier: dict[Tier, int] = {t: 0 for t in Tier}
        self.calls: list[tuple[Task, Tier]] = []
        self.grounding_checked = 0
        self.grounding_caught = 0

    def record(self, task: Task, tier: Tier) -> None:
        self.calls_by_tier[tier] += 1
        self.calls.append((task, tier))

    def record_grounding(self, *, unsupported: bool) -> None:
        self.grounding_checked += 1
        if unsupported:
            self.grounding_caught += 1

    def summary(self) -> dict:
        cost = sum(COST_PER_CALL[t] for _, t in self.calls)
        # Baseline: every generation/judgment task forced onto the strong tier;
        # embeddings are not an LLM chat, so they stay on the embed tier in both.
        baseline = sum(
            COST_PER_CALL[Tier.EMBED] if task == Task.EMBED else COST_PER_CALL[Tier.STRONG]
            for task, _ in self.calls
        )
        total = len(self.calls)
        return {
            "calls_by_tier": {t.value: self.calls_by_tier[t] for t in Tier},
            "total_calls": total,
            "cost_usd": round(cost, 6),
            "baseline_cost_usd": round(baseline, 6),
            "savings_x": round(baseline / cost, 1) if cost else 0.0,
            "grounding": {
                "checked": self.grounding_checked,
                "unsupported_caught": self.grounding_caught,
                "catch_rate": round(self.grounding_caught / self.grounding_checked, 3)
                if self.grounding_checked
                else 0.0,
            },
        }


RUN = _Run()
