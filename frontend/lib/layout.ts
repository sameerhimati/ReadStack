import type { Edge, Node } from "reactflow";
import type { TopicNode } from "./types";

export type TopicNodeData = {
  label: string;
  count: number;
  depth: number;
  isLeaf: boolean;
  index: number; // stagger order, for bloom animation
};

const NODE_W = 200;
const H_GAP = 36; // horizontal gap between leaf subtrees
const V_GAP = 130; // vertical gap between depth levels

// Tidy top-down layout computed from depth + sibling position.
// We assign each leaf an x slot, then place parents at the midpoint of their
// children so the tree reads as a clean dendrogram. No layout lib needed.
export function layoutTopics(root: TopicNode): {
  nodes: Node<TopicNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<TopicNodeData>[] = [];
  const edges: Edge[] = [];

  let nextLeafX = 0;
  let order = 0; // global traversal order for staggered bloom

  // First pass: assign x to every node (post-order so parents center on kids).
  const xById = new Map<string, number>();

  function assignX(node: TopicNode): number {
    if (node.children.length === 0) {
      const x = nextLeafX;
      nextLeafX += NODE_W + H_GAP;
      xById.set(node.id, x);
      return x;
    }
    const childXs = node.children.map(assignX);
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    xById.set(node.id, x);
    return x;
  }
  assignX(root);

  // Second pass: emit nodes + edges using assigned x and depth-based y.
  function emit(node: TopicNode, parentId: string | null) {
    const x = xById.get(node.id) ?? 0;
    const y = node.depth * V_GAP;

    nodes.push({
      id: node.id,
      type: "topic",
      position: { x, y },
      data: {
        label: node.label,
        count: node.article_urls.length,
        depth: node.depth,
        isLeaf: node.children.length === 0,
        index: order++,
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
      });
    }

    node.children.forEach((c) => emit(c, node.id));
  }
  emit(root, null);

  return { nodes, edges };
}

// Depth-first list of leaf topics (the ones that get a lesson).
export function leafTopics(root: TopicNode): TopicNode[] {
  const out: TopicNode[] = [];
  function walk(n: TopicNode) {
    if (n.children.length === 0) out.push(n);
    else n.children.forEach(walk);
  }
  walk(root);
  return out;
}

// Flat lookup of every node by id (for selection / titles).
export function indexTopics(root: TopicNode): Map<string, TopicNode> {
  const m = new Map<string, TopicNode>();
  function walk(n: TopicNode) {
    m.set(n.id, n);
    n.children.forEach(walk);
  }
  walk(root);
  return m;
}
