"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
} from "react-force-graph-2d";
import type { TopicNode } from "@/lib/types";

// One graph node per TopicNode. We carry everything the canvas renderer needs
// so it never has to walk back into the tree at draw time.
type GraphNode = {
  id: string;
  label: string;
  depth: number;
  count: number;
  isRoot: boolean;
  isLeaf: boolean;
};

type GraphLink = { source: string; target: string };

// The warm editorial palette, resolved from CSS custom properties once on the
// client (canvas can't read CSS vars at draw time). Re-read on theme toggle.
type Palette = {
  paper: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  border: string;
};

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    paper: v("--paper", "#fbfaf7"),
    surface: v("--surface", "#ffffff"),
    ink: v("--ink", "#1a1a1a"),
    muted: v("--muted", "#6b6b6b"),
    accent: v("--accent", "#b5562e"),
    // --border resolves to an rgba() with alpha; fine for canvas strokes.
    border: v("--border", "rgba(0,0,0,0.1)"),
  };
}

// Flatten the TopicNode tree into force-graph data: one node per topic, one
// link per parent->child edge. Same post-order walk style as the old layout.
function buildGraph(root: TopicNode): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  function walk(node: TopicNode, parentId: string | null) {
    nodes.push({
      id: node.id,
      label: node.label,
      depth: node.depth,
      count: node.article_urls.length,
      isRoot: node.depth === 0,
      isLeaf: node.children.length === 0,
    });
    if (parentId) links.push({ source: parentId, target: node.id });
    node.children.forEach((c) => walk(c, node.id));
  }
  walk(root, null);

  return { nodes, links };
}

// Rounded-rect path helper (canvas roundRect isn't universal across the
// targeted browsers, so we draw it ourselves for safety).
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Pixel geometry for a node's pill, in graph units (globalScale-independent so
// the layout's collision/repulsion stays stable across zoom).
function pillMetrics(node: GraphNode) {
  // Root reads larger and serif; topics medium; facets smaller.
  const fontSize = node.isRoot ? 7 : node.depth === 1 ? 6 : 5.2;
  const padX = node.isRoot ? 7 : 5.5;
  const padY = node.isRoot ? 4.5 : 3.5;
  return { fontSize, padX, padY };
}

export default function TopicGraphCanvas({
  root,
  selectedId,
  onSelect,
}: {
  root: TopicNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const fgRef =
    useRef<ForceGraphMethods<NodeObject<GraphNode>, GraphLink>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [palette, setPalette] = useState<Palette | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Rebuild graph data only when the tree identity changes (new pipeline run /
  // rename). force-graph mutates node objects in place with x/y, so we hand it a
  // fresh array each time the tree changes.
  const graphData = useMemo(() => buildGraph(root), [root]);

  // Resolve palette on mount; re-read when the theme class flips.
  useEffect(() => {
    setPalette(readPalette());
    const obs = new MutationObserver(() => setPalette(readPalette()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // Track container size so the canvas fills its box and stays responsive.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tune the simulation once the graph instance exists: a calm, readable spread.
  // Moderate repulsion, link distance scaled by depth so labels don't collide.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force("charge");
    if (charge) {
      charge.strength(-220);
      charge.distanceMax?.(260);
    }

    const link = fg.d3Force("link");
    if (link) {
      link.distance?.((l: { target: NodeObject<GraphNode> }) => {
        const t = l.target as NodeObject<GraphNode>;
        // Deeper = a touch tighter, so facets cluster under their topic.
        return typeof t === "object" && t.depth >= 2 ? 42 : 64;
      });
      link.strength?.(0.9);
    }

    const center = fg.d3Force("center");
    // Keeps the graph from drifting off-canvas.
    center?.strength?.(0.06);

    fg.d3ReheatSimulation();
  }, [graphData]);

  // Drawn pill bounds keyed by node id, refreshed each render pass. Used by the
  // pointer-area painter so the clickable region matches the visible pill.
  const boundsRef = useRef(
    new Map<string, { w: number; h: number }>()
  );

  if (!palette) {
    // Avoid a flash of default-styled canvas before tokens resolve.
    return <div ref={containerRef} className="h-full w-full" />;
  }

  const drawNode = (
    node: NodeObject<GraphNode>,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const n = node as GraphNode & NodeObject<GraphNode>;
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    const { fontSize, padX, padY } = pillMetrics(n);
    const isSelected = n.id === selectedId;
    const isHovered = n.id === hoverId && !n.isRoot;

    const fontStack = n.isRoot
      ? '600 ' +
        fontSize +
        'px "Iowan Old Style", Charter, Georgia, serif'
      : "500 " + fontSize + 'px -apple-system, "Inter", system-ui, sans-serif';

    // Measure label + (optional) count badge to size the pill.
    ctx.font = fontStack;
    const labelW = ctx.measureText(n.label).width;
    const badgeText = n.isRoot ? "" : String(n.count);
    const badgeFont = `500 ${fontSize * 0.82}px "Geist Mono", ui-monospace, monospace`;
    let badgeW = 0;
    if (badgeText) {
      ctx.font = badgeFont;
      badgeW = ctx.measureText(badgeText).width + fontSize * 0.9; // pill padding
    }

    const gap = badgeText ? fontSize * 0.7 : 0;
    const innerW = labelW + gap + badgeW;
    const w = innerW + padX * 2;
    const h = fontSize + padY * 2;

    boundsRef.current.set(n.id, { w, h });

    const left = x - w / 2;
    const top = y - h / 2;

    // Fill + border, warm and flat (borders not glow), matching TopicGraphNode.
    let fill = palette.surface;
    let stroke = palette.border;
    let textColor = palette.ink;
    let lineWidth = 1 / globalScale;

    if (isSelected) {
      fill = palette.accent;
      stroke = palette.accent;
      textColor = palette.paper;
      lineWidth = 1.5 / globalScale;
    } else if (isHovered) {
      stroke = palette.accent;
      lineWidth = 1.4 / globalScale;
    }

    // Soft drop to lift the pill off the paper, kept very subtle.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 3 / globalScale;
    ctx.shadowOffsetY = 0.8 / globalScale;
    roundRect(ctx, left, top, w, h, h * 0.32);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    roundRect(ctx, left, top, w, h, h * 0.32);
    ctx.stroke();

    // Label.
    ctx.font = fontStack;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = textColor;
    ctx.fillText(n.label, left + padX, y + 0.3);

    // Count badge (a small rounded chip on the right, like the old DOM badge).
    if (badgeText) {
      const badgeH = h - padY * 1.1;
      const badgeLeft = left + padX + labelW + gap;
      const badgeTop = y - badgeH / 2;
      roundRect(ctx, badgeLeft, badgeTop, badgeW, badgeH, badgeH / 2);
      ctx.fillStyle = isSelected ? "rgba(255,255,255,0.22)" : palette.paper;
      ctx.fill();
      ctx.font = badgeFont;
      ctx.textAlign = "center";
      ctx.fillStyle = isSelected ? palette.paper : palette.muted;
      ctx.fillText(badgeText, badgeLeft + badgeW / 2, y + 0.3);
    }
  };

  // Paint the exact pill rect into the pointer-area buffer so hit-testing
  // matches what's drawn (not a default circle).
  const paintPointerArea = (
    node: NodeObject<GraphNode>,
    color: string,
    ctx: CanvasRenderingContext2D
  ) => {
    const n = node as GraphNode & NodeObject<GraphNode>;
    const b = boundsRef.current.get(n.id);
    if (!b) return;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    ctx.fillStyle = color;
    roundRect(ctx, x - b.w / 2, y - b.h / 2, b.w, b.h, b.h * 0.32);
    ctx.fill();
  };

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={4}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointerArea}
          // Understated edges, matching the old smoothstep border color.
          linkColor={() => palette.border}
          linkWidth={1}
          // No drag — this is a read-only map, like the old graph.
          enableNodeDrag={false}
          minZoom={0.5}
          maxZoom={3}
          onNodeHover={(node) => {
            const n = node as (GraphNode & NodeObject<GraphNode>) | null;
            setHoverId(n && !n.isRoot ? n.id : null);
            if (containerRef.current) {
              containerRef.current.style.cursor =
                n && !n.isRoot ? "pointer" : "default";
            }
          }}
          onNodeClick={(node) => {
            const n = node as GraphNode & NodeObject<GraphNode>;
            // Root isn't a topic you read; clicking it is a no-op (matches old).
            if (n.isRoot) return;
            onSelect(n.id);
          }}
          // Finite settle, then gently frame the whole graph — the "bloom".
          cooldownTicks={120}
          d3AlphaDecay={0.045}
          d3VelocityDecay={0.45}
          onEngineStop={() => fgRef.current?.zoomToFit(600, 40)}
        />
      )}
    </div>
  );
}
