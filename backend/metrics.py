"""Run metrics — the on-screen evidence for the inference thesis.

Tallies every routing decision by tier, prices the run against an all-strong
baseline, and tracks the grounding catch-rate. Demo-grade: a single module-level
recorder reset at the start of each pipeline run (one user, one request at a
time). tasks.py calls record() right after it calls route(), so the numbers
reflect the real routing policy even while inference is mocked.
"""
from __future__ import annotations

from contracts import Task, Tier

# Illustrative $/call per tier. Absolute values don't matter for the demo — the
# RATIO between tiers is the story (a 405B call dwarfs an 8B call).
COST_PER_CALL = {
    Tier.EMBED: 0.00002,
    Tier.WEAK: 0.0001,
    Tier.MID: 0.0020,
    Tier.STRONG: 0.0200,
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
