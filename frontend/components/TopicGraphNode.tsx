"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import type { TopicNodeData } from "@/lib/layout";

// Topic graph node — warm, flat, borders not glow. The `selected` prop is wired
// by React Flow. One subtle staggered fade keyed off traversal order (the only
// motion on the Map).
export default function TopicGraphNode({
  data,
  selected,
}: NodeProps<TopicNodeData>) {
  const isRoot = data.depth === 0;

  return (
    <div
      className="animate-bloom"
      style={{ animationDelay: `${data.index * 60}ms` }}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className={[
          "flex items-center gap-2.5 rounded-md border px-3.5 py-2 text-sm transition-colors",
          isRoot
            ? "border-[var(--border)] bg-[var(--surface)] font-serif font-semibold text-[var(--ink)]"
            : "bg-[var(--surface)] text-[var(--ink)]",
          selected
            ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
            : isRoot
              ? ""
              : "border-[var(--border)] hover:border-[var(--accent)]",
          !isRoot ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
        style={{ minWidth: 168 }}
      >
        <span className="truncate">{data.label}</span>
        {!isRoot && (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--paper)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--muted)]">
            {data.count}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
