"""
Module C — topic structure.

Turn embedded Articles into a SHALLOW TopicNode tree (max depth 2). The shape is
decided by router.should_split (pure policy): a top-level topic only gets a
sub-level when the router says so, given the topic's size, coherence, and depth.
We never hardcode those thresholds here — coherence is the neural signal, the
router owns the rule.

Why flat, not a binary cascade: a recursive 2-way split produces a deep, lopsided
tree of single-article leaves with repeated labels ("Reinforcement ->
Reinforcement -> Reinforcement"). Readers think in ~5-7 top themes, each with a
few distinct facets. So: flat k-way top level (k picked by silhouette), then ONE
rule-gated sub-level. Root (depth 0) -> top topics (depth 1) -> facets (depth 2).

Coherence = mean pairwise cosine similarity of L2-normalized embeddings. Labels
are cheap provisional placeholders (most-common tag); module B relabels later.
"""
from __future__ import annotations

import logging

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from contracts import Article, TopicNode
from router import should_split

log = logging.getLogger(__name__)

# Top level aims for the ~5-7 themes a reader can hold in their head; the sub
# level (only when should_split fires) splits a big, incoherent theme into a few
# distinct facets. Both are clamped so tiny corpora degrade sanely (>=2 per group).
_TOP_K_RANGE = (5, 7)
_SUB_K_RANGE = (2, 3)


def _coherence(unit_vecs: np.ndarray) -> float:
    """Mean pairwise cosine similarity of already-normalized rows. <2 rows -> 1.0."""
    n = len(unit_vecs)
    if n < 2:
        return 1.0
    sims = unit_vecs @ unit_vecs.T            # cosine since rows are unit-norm
    off = sims.sum() - np.trace(sims)         # drop self-similarities
    return float(off / (n * (n - 1)))         # average over ordered off-diagonal pairs


def _label(indices: list[int], articles: list[Article], node_id: str) -> str:
    """Provisional label: most common tag among the node's articles, else Topic <id>."""
    counts: dict[str, int] = {}
    for i in indices:
        for tag in articles[i].tags:
            counts[tag] = counts.get(tag, 0) + 1
    if not counts:
        return f"Topic {node_id}"
    return max(counts, key=lambda t: counts[t])


def _kmeans_labels(unit: np.ndarray, k_range: tuple[int, int]) -> np.ndarray | None:
    """Cluster unit-norm rows into k groups, k chosen by best silhouette in range.

    k is clamped so each group holds >=2 rows on average and k is a valid
    silhouette argument (2 <= k <= n-1). Returns per-row labels, or None when the
    subset is too small to split (caller should treat as a single group).
    """
    n = len(unit)
    k_max = min(k_range[1], n // 2, n - 1)
    k_min = min(k_range[0], k_max)
    if k_max < 2:                              # n <= 3: not worth splitting
        return None

    best_labels: np.ndarray | None = None
    best_score = -1.0
    for k in range(k_min, k_max + 1):
        labels = KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(unit)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(unit, labels, metric="cosine")
        if score > best_score:
            best_score, best_labels = score, labels
    return best_labels


def build(articles: list[Article]) -> TopicNode:
    """Embedded Articles -> a shallow (<=2 deep) TopicNode tree (root returned)."""
    # Filter out anything we can't place: missing/None embedding.
    usable = [a for a in articles if a.embedding]
    dropped = len(articles) - len(usable)
    if dropped:
        log.warning("cluster.build: dropping %d article(s) with no embedding", dropped)

    counter = 0

    def next_id() -> str:
        nonlocal counter
        node_id = f"t{counter}"
        counter += 1
        return node_id

    # Trivial cases: nothing usable -> empty root leaf.
    if not usable:
        return TopicNode(id=next_id(), label="Topic t0", article_urls=[], children=[], depth=0)

    unit = np.asarray([a.embedding for a in usable], dtype=float)
    norms = np.linalg.norm(unit, axis=1, keepdims=True)
    unit = unit / np.where(norms == 0.0, 1.0, norms)   # L2-normalize, guard zero vectors

    all_indices = list(range(len(usable)))
    root_id = next_id()
    root_urls = [usable[i].url for i in all_indices]
    root_label = _label(all_indices, usable, root_id)

    def _leaf(indices: list[int], depth: int) -> TopicNode:
        node_id = next_id()
        return TopicNode(
            id=node_id,
            label=_label(indices, usable, node_id),
            article_urls=[usable[i].url for i in indices],
            children=[],
            depth=depth,
        )

    def _topic(indices: list[int]) -> TopicNode:
        """One top-level theme (depth 1); gets a facet sub-level only if the router says so."""
        node_id = next_id()
        urls = [usable[i].url for i in indices]
        label = _label(indices, usable, node_id)
        coherence = _coherence(unit[indices])

        if should_split(n_articles=len(indices), coherence=coherence, depth=1):
            sub = _kmeans_labels(unit[indices], _SUB_K_RANGE)
            if sub is not None:
                groups = [
                    [indices[j] for j in range(len(indices)) if sub[j] == g]
                    for g in sorted(set(sub))
                ]
                groups = [g for g in groups if g]
                if len(groups) >= 2:
                    children = [_leaf(g, depth=2) for g in groups]
                    return TopicNode(id=node_id, label=label, article_urls=urls,
                                     children=children, depth=1)
        # Stayed coherent / small enough / didn't separate -> leaf at depth 1.
        return TopicNode(id=node_id, label=label, article_urls=urls, children=[], depth=1)

    # Tiny corpus or too-small-to-cluster -> the root itself is the single topic.
    top = _kmeans_labels(unit, _TOP_K_RANGE)
    if top is None:
        return TopicNode(id=root_id, label=root_label, article_urls=root_urls,
                         children=[], depth=0)

    top_groups = [
        [all_indices[j] for j in range(len(all_indices)) if top[j] == g]
        for g in sorted(set(top))
    ]
    top_groups = [g for g in top_groups if g]
    children = [_topic(g) for g in top_groups]
    return TopicNode(id=root_id, label=root_label, article_urls=root_urls,
                     children=children, depth=0)


def iter_nodes(root: TopicNode):
    """Yield every node in the tree, depth-first (parent before children)."""
    yield root
    for child in root.children:
        yield from iter_nodes(child)


if __name__ == "__main__":
    import random

    logging.basicConfig(level=logging.INFO)
    random.seed(7)
    np.random.seed(7)

    # ~48 fake articles drawn from 6 latent clusters so a real top level can form;
    # a couple of clusters are deliberately noisy so the sub-level can trigger.
    fake: list[Article] = []
    centers = [np.random.randn(16) for _ in range(6)]
    topics = ["ml", "web", "econ", "bio", "sec", "design"]
    for k in range(48):
        c = k % 6
        spread = 1.6 if c in (0, 1) else 0.6   # first two themes are incoherent
        vec = centers[c] + np.random.randn(16) * spread
        fake.append(
            Article(
                url=f"https://example.com/{k}",
                title=f"Article {k}",
                tags=[topics[c]],
                embedding=vec.tolist(),
            )
        )

    tree = build(fake)

    def show(node: TopicNode) -> None:
        print(f"{'  ' * node.depth}{node.id} [{node.label}] ({len(node.article_urls)} articles)")
        for child in node.children:
            show(child)

    show(tree)
    print(f"\ntotal nodes: {sum(1 for _ in iter_nodes(tree))}")
    print(f"max depth: {max(n.depth for n in iter_nodes(tree))}")
