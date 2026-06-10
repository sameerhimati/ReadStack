"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import type { TopicNodeData } from "@/lib/layout";

// Custom node for the topic graph. The `selected` prop is wired by React Flow.
// Staggered bloom-in via animation-delay keyed off traversal order.
export default function TopicGraphNode({
  data,
  selected,
}: NodeProps<TopicNodeData>) {
  const isRoot = data.depth === 0;

  return (
    <div
      className="group"
      style={{
        animation: "bloomIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        animationDelay: `${data.index * 90}ms`,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
      <div
        className={[
          "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition",
          "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur",
          isRoot
            ? "border-slate-600/60 bg-slate-800/70 font-semibold text-slate-100"
            : "bg-slate-900/70 text-slate-200",
          selected
            ? "border-teal-400/80 ring-2 ring-teal-400/30"
            : isRoot
              ? ""
              : "border-slate-700/70 hover:border-slate-500",
          !isRoot ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
        style={{ minWidth: 168 }}
      >
        <span
          className={[
            "h-2 w-2 shrink-0 rounded-full",
            isRoot
              ? "bg-slate-400"
              : data.isLeaf
                ? "bg-teal-400"
                : "bg-sky-400",
          ].join(" ")}
        />
        <span className="truncate">{data.label}</span>
        {!isRoot && (
          <span className="ml-auto shrink-0 rounded-full bg-slate-700/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-300">
            {data.count}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-slate-600"
      />
    </div>
  );
}
