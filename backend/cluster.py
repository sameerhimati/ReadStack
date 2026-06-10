"""
Module C — topic structure.

Turn embedded Articles into a hierarchical TopicNode tree. The shape of the tree
is decided by router.should_split (pure policy): we split a topic only when the
router says so, given the topic's size, coherence, and depth. We never hardcode
those thresholds here — coherence is the neural signal, the router owns the rule.

Coherence = mean pairwise cosine similarity of L2-normalized embeddings. Labels
are cheap provisional placeholders (most-common tag); module B relabels later.
"""
from __future__ import annotations

import logging

import numpy as np
from sklearn.cluster import AgglomerativeClustering

from contracts import Article, TopicNode
from router import should_split

log = logging.getLogger(__name__)


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


def build(articles: list[Article]) -> TopicNode:
    """Embedded Articles -> a hierarchical TopicNode tree (root returned)."""
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

    def _split(indices: list[int], depth: int) -> TopicNode:
        node_id = next_id()
        urls = [usable[i].url for i in indices]
        label = _label(indices, usable, node_id)

        coherence = _coherence(unit[indices])
        if not should_split(n_articles=len(indices), coherence=coherence, depth=depth):
            return TopicNode(id=node_id, label=label, article_urls=urls, children=[], depth=depth)

        # Partition into 2 via agglomerative clustering on the subset's embeddings.
        # Ward linkage on the L2-normalized vectors (euclidean dist is monotonic
        # with cosine here) gives BALANCED halves; average/cosine linkage chains
        # off tiny outliers and leaves one giant blob -> a degenerate tree.
        labels = AgglomerativeClustering(
            n_clusters=2, linkage="ward"
        ).fit_predict(unit[indices])
        groups = [[indices[j] for j in range(len(indices)) if labels[j] == g] for g in (0, 1)]
        groups = [g for g in groups if g]  # defensive: drop an empty side

        # If clustering didn't actually separate anything, stop here as a leaf.
        if len(groups) < 2:
            return TopicNode(id=node_id, label=label, article_urls=urls, children=[], depth=depth)

        children = [_split(g, depth + 1) for g in groups]
        return TopicNode(id=node_id, label=label, article_urls=urls, children=children, depth=depth)

    return _split(list(range(len(usable))), depth=0)


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

    # ~30 fake articles drawn from a few latent clusters so a tree can form.
    fake: list[Article] = []
    centers = [np.random.randn(16) for _ in range(3)]
    topics = ["ml", "web", "econ"]
    for k in range(30):
        c = k % 3
        vec = centers[c] + np.random.randn(16) * 1.4   # noisy -> some incoherence
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
