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
SPLIT_MIN_ARTICLES = 6           # clusters smaller than this never subdivide
# Granularity is DATA-DRIVEN, not a fixed coherence cutoff: a node subdivides only
# when its best sub-clustering is genuinely separable (silhouette) AND the split
# actually tightens the groups (coherence gain). Both signals are scale-free, so
# they don't need recalibration when the embedder or corpus changes.
SPLIT_MIN_SILHOUETTE = 0.05      # sub-structure must be at least this separable (cosine)
SPLIT_MIN_COHERENCE_GAIN = 0.03  # ...and splitting must raise mean group coherence this much
SPLIT_MIN_CHILD_ARTICLES = 2     # ...and produce no singleton facets (those read as noise)
STOP_MAX_ARTICLES = 5            # small enough -> leaf node
STOP_MAX_DEPTH = 4               # depth emerges from content; this is just a backstop


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


def should_split(
    n_articles: int,
    silhouette: float,
    coherence_gain: float,
    min_child_size: int,
    depth: int,
) -> bool:
    """Granularity rule: subdivide a node only when the data shows real substructure.

    Split iff the node is big enough AND its best sub-clustering is separable
    (silhouette), tighter than the parent (coherence gain), and free of singleton
    facets (min_child_size). A genuinely homogeneous node clears none of these and
    stays a leaf, so depth emerges from the content instead of an absolute,
    embedder-specific coherence cutoff.
    """
    if depth >= STOP_MAX_DEPTH or n_articles <= STOP_MAX_ARTICLES:
        return False
    if n_articles < SPLIT_MIN_ARTICLES or min_child_size < SPLIT_MIN_CHILD_ARTICLES:
        return False
    return silhouette >= SPLIT_MIN_SILHOUETTE and coherence_gain >= SPLIT_MIN_COHERENCE_GAIN
