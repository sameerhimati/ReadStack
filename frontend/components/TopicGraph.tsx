"use client";

import dynamic from "next/dynamic";
import type { TopicNode } from "@/lib/types";

// react-force-graph-2d touches window/canvas, so it can't be server-rendered.
// We load the actual canvas component client-only via next/dynamic. ssr:false
// is legal here because this wrapper is itself a Client Component.
const TopicGraphCanvas = dynamic(() => import("./TopicGraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted)]">
      Building map…
    </div>
  ),
});

// Public contract is unchanged from the old ReactFlow version, so page.tsx
// keeps working as-is: render the TopicNode tree, click a topic to focus it.
export default function TopicGraph({
  root,
  selectedId,
  onSelect,
}: {
  root: TopicNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <TopicGraphCanvas root={root} selectedId={selectedId} onSelect={onSelect} />
  );
}
