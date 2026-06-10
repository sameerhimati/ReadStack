"""
Module C — topic structure.

Turn embedded Articles into a TopicNode tree whose DEPTH EMERGES FROM THE DATA.
The root always fans out into the ~5-7 top themes a reader can hold in their head
(the graph "bloom"); below that, every node subdivides only when the data shows
real substructure. router.should_split (pure policy) owns that rule; we feed it
scale-free signals (silhouette + coherence gain) so nothing here is an absolute,
embedder-specific cutoff.

Why data-driven, not a fixed coherence threshold: an absolute cutoff is brittle —
it has to be retuned for every embedder/corpus (the old 0.72 was nomic-specific).
Instead a node splits iff its best sub-clustering is genuinely separable
(silhouette >= margin) AND tightens the groups (mean child coherence rises). A
homogeneous theme clears neither bar and stays a leaf — correct, not a bug — while
a diverse one keeps subdividing by ITS OWN internal structure. The same guards
(min size, coherence gain) prevent degenerate single-article cascades with
repeated labels ("Reinforcement -> Reinforcement -> Reinforcement").

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

# The root fans out into the ~5-7 themes a reader can hold in their head (always,
# for the graph bloom); deeper levels use a tighter k range and only materialize
# when should_split fires. Both are clamped so tiny corpora degrade sanely.
_ROOT_K_RANGE = (5, 7)
_SUB_K_RANGE = (2, 4)


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


def _best_kmeans(
    unit: np.ndarray, k_range: tuple[int, int]
) -> tuple[np.ndarray | None, float]:
    """Cluster unit-norm rows into k groups, k chosen by best silhouette in range.

    k is clamped so each group holds >=2 rows on average and k is a valid
    silhouette argument (2 <= k <= n-1). Returns (per-row labels, silhouette), or
    (None, -1.0) when the subset is too small to split (caller treats as one group).
    The silhouette is the split-quality signal the router gates on.
    """
    n = len(unit)
    k_max = min(k_range[1], n // 2, n - 1)
    k_min = min(k_range[0], k_max)
    if k_max < 2:                              # n <= 3: not worth splitting
        return None, -1.0

    best_labels: np.ndarray | None = None
    best_score = -1.0
    for k in range(k_min, k_max + 1):
        labels = KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(unit)
        if len(set(labels)) < 2:
            continue
        score = silhouette_score(unit, labels, metric="cosine")
        if score > best_score:
            best_score, best_labels = score, labels
    return best_labels, best_score


def build(articles: list[Article]) -> TopicNode:
    """Embedded Articles -> a TopicNode tree whose depth emerges from the data."""
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

    # Trivial case: nothing usable -> empty root leaf.
    if not usable:
        return TopicNode(id=next_id(), label="Topic t0", article_urls=[], children=[], depth=0)

    unit = np.asarray([a.embedding for a in usable], dtype=float)
    norms = np.linalg.norm(unit, axis=1, keepdims=True)
    unit = unit / np.where(norms == 0.0, 1.0, norms)   # L2-normalize, guard zero vectors

    def _groups(indices: list[int], labels: np.ndarray | None) -> list[list[int]] | None:
        """Map sub-cluster labels (positions within `indices`) back to index groups."""
        if labels is None:
            return None
        groups = [
            [indices[j] for j in range(len(indices)) if labels[j] == g]
            for g in sorted(set(labels))
        ]
        groups = [g for g in groups if g]
        return groups if len(groups) >= 2 else None

    def _child_coherence(groups: list[list[int]]) -> float:
        """Size-weighted mean coherence across candidate child groups."""
        total = sum(len(g) for g in groups)
        return sum(_coherence(unit[g]) * len(g) for g in groups) / total

    def _maybe_split(indices: list[int], depth: int) -> list[list[int]] | None:
        """Child index-groups if this node should subdivide, else None.

        Root (depth 0) always fans out into the top themes (the graph bloom). Below
        that, we compute the data signals (silhouette + coherence gain) and let
        router.should_split — the sole owner of the size/depth/quality policy —
        decide whether the substructure is real enough to materialize.
        """
        if depth == 0:
            labels, _score = _best_kmeans(unit[indices], _ROOT_K_RANGE)
            return _groups(indices, labels)

        labels, silhouette = _best_kmeans(unit[indices], _SUB_K_RANGE)
        groups = _groups(indices, labels)
        if groups is None:
            return None
        gain = _child_coherence(groups) - _coherence(unit[indices])
        min_child = min(len(g) for g in groups)
        if not should_split(len(indices), silhouette, gain, min_child, depth):
            return None
        return groups

    def _node(indices: list[int], depth: int) -> TopicNode:
        node_id = next_id()
        urls = [usable[i].url for i in indices]
        label = _label(indices, usable, node_id)
        groups = _maybe_split(indices, depth)
        children = [_node(g, depth + 1) for g in groups] if groups else []
        return TopicNode(id=node_id, label=label, article_urls=urls,
                         children=children, depth=depth)

    return _node(list(range(len(usable))), depth=0)


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
