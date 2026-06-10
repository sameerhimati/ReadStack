"""
Neurosymbolic routing policy — the spine of ReadStack.

The *symbolic* half: explicit, auditable rules decide which model tier runs each
task and how granular the topic tree gets. No big LLM guessing the control flow.
The *neural* half: cheap models supply the fuzzy SIGNALS (coherence, hero-ness,
groundedness) that these rules act on.

This module is pure policy — deterministic given its inputs. That's the point:
every routing / granularity / escalation decision is a rule you can read and
defend in front of a judge.
"""
from contracts import RouteDecision, Task, Tier

# --- Task -> default tier (the routing map) ----------------------------------
_DEFAULT_TIER = {
    Task.TAG: Tier.WEAK,       # high volume, simple
    Task.EMBED: Tier.EMBED,
    Task.CLUSTER: Tier.WEAK,   # naming + coherence judgment
    Task.LESSON: Tier.MID,     # a human consumes this
    Task.VERIFY: Tier.WEAK,    # cheap entailment, runs on every lesson
}

# --- Symbolic knobs (thresholds) ---------------------------------------------
HERO_TOPIC_MIN_ARTICLES = 8      # a topic this big earns a stronger lesson model
GROUNDING_ESCALATE_BELOW = 0.6   # weak verifier unsure -> escalate the check
SPLIT_MIN_ARTICLES = 6           # clusters bigger than this may split...
SPLIT_MAX_COHERENCE = 0.72       # ...only if they're also incoherent (calibrated to
                                 # nomic-embed, whose cosines run ~0.4 higher than MiniLM)
STOP_MAX_ARTICLES = 5            # small enough -> leaf node
STOP_MAX_DEPTH = 4


def route(task: Task, *, topic_size: int = 0, grounding_score: float = 1.0) -> RouteDecision:
    """Pick a model tier for a task, applying escalation rules."""
    tier = _DEFAULT_TIER[task]

    # Rule: hero topics get a stronger lesson writer.
    if task == Task.LESSON and topic_size >= HERO_TOPIC_MIN_ARTICLES:
        tier = Tier.STRONG

    # Rule: if the cheap verifier is unsure, escalate the grounding check.
    if task == Task.VERIFY and grounding_score < GROUNDING_ESCALATE_BELOW:
        tier = Tier.STRONG

    return RouteDecision(task=task, tier=tier)


def should_split(n_articles: int, coherence: float, depth: int) -> bool:
    """Granularity rule: split a topic only if it's both big AND incoherent."""
    if depth >= STOP_MAX_DEPTH or n_articles <= STOP_MAX_ARTICLES:
        return False
    return n_articles >= SPLIT_MIN_ARTICLES and coherence < SPLIT_MAX_COHERENCE
