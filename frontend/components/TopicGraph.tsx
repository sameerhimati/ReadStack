"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import type { TopicNode } from "@/lib/types";
import { layoutTopics, type TopicNodeData } from "@/lib/layout";
import TopicGraphNode from "./TopicGraphNode";

const nodeTypes = { topic: TopicGraphNode };

export default function TopicGraph({
  root,
  selectedId,
  onSelect,
}: {
  root: TopicNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Re-layout whenever the tree identity changes (new pipeline run).
  const { nodes, edges } = useMemo(() => layoutTopics(root), [root]);

  // Reflect selection into node props so the custom node can highlight.
  const styledNodes = useMemo<Node<TopicNodeData>[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        draggable: false,
        connectable: false,
      })),
    [nodes, selectedId]
  );

  const handleNodeClick: NodeMouseHandler = (_e, node) => {
    // Root isn't selectable as a lesson target.
    if (node.id === "root") return;
    onSelect(node.id);
  };

  return (
    <ReactFlow
      key={root.id + nodes.length}
      nodes={styledNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnScroll={false}
      minZoom={0.4}
      maxZoom={1.4}
      className="!bg-transparent"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={28}
        size={1}
        color="rgba(148,163,184,0.12)"
      />
    </ReactFlow>
  );
}
