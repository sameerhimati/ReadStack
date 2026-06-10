# ReadStack — Design System

> The product is a reading surface. This doc is the single source of truth for how
> it looks and feels. Every component codes against these tokens. When in doubt,
> match LibStack (the sibling reading app) — ReadStack is part of that family.

## The problem we're fixing
The first frontend was generic dark-slate + teal — "AI-generated" slop. It also
led with a topic *graph* and a jargon "grounded" badge. We're correcting all
three: **articles-first**, a **warm editorial** look that belongs to Sameer's
ecosystem, and **plain-language** trust signals.

## North star (the vibe)
**Warm, editorial, reading-first.** Like a well-kept library, not a SaaS
dashboard. Borrowed deliberately from three live apps:
- **LibStack** (the direct analog): paper/ink palette, serif body, 68ch measure,
  borders over shadows, calm. *This is our backbone.*
- **sameerhimati.github.io**: editorial restraint, a single energetic warm accent,
  generous reading line-height.
- **atlas**: discipline for the **metrics tab** — tabular-nums, semantic colors,
  dense-but-honest data, no decoration.

Across all three: warm accent, serif display + clean sans UI + mono numbers,
**borders not shadows**, restrained motion (`transition-colors`, ~150ms). We
inherit that, we don't reinvent it.

## Information architecture (articles-first)
1. **Reading** (home) — topic-grouped article list. Left rail = topics; main =
   articles under each topic, each topic with a play-able lesson. *This is the app.*
2. **Map** — the topic graph as a secondary toggle (flat, ~5–7 real topics; see
   "Topic graph" below). Not the home screen.
3. **Inference** — the metric panel as its own tab (still there for judges; no
   longer the hero). Atlas-style.
Add articles via a **+ Add** button → bookmarklet / extension hitting `/add`.

## Color tokens
Light is default; dark is a toggle (mirror LibStack's `.dark` strategy, no-FOUC
inline script). Define as CSS vars; reference via Tailwind, never raw hex in JSX.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#fbfaf7` | `#15140f` | page background |
| `--surface` | `#ffffff` | `#1c1a14` | cards, raised rows (subtle) |
| `--ink` | `#1a1a1a` | `#ece8df` | primary text |
| `--muted` | `#6b6b6b` | `#9a948a` | secondary text, labels |
| `--accent` | `#b5562e` | `#e0865c` | brand / interactive (terracotta — our own warm hue, distinct from LibStack's tan) |
| `--border` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.10)` | dividers, inputs |
| `--verified` | `#0f8a5f` | `#34c08a` | "Verified against your sources ✓" |
| `--unverified` | `#c2790b` | `#e0a23a` | "⚠ N claims not in your sources" |

**Metric tiers** (Inference tab): cheap (embed+weak) `--verified` green-teal ·
mid `--unverified` amber · strong `#c0492e` red. The bar should read "mostly
green" at a glance — that *is* the thesis.

Accent is the one tunable hue; lock it in design-review.

## Typography
- **Serif** (article titles + lesson prose): `Iowan Old Style, Charter, Georgia,
  serif`. Reading is serif; chrome is not.
- **Sans** (all UI): `-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif`.
- **Mono** (numbers in metrics): `Geist Mono, ui-monospace, monospace` + `tabular-nums`.

| Role | Class |
|---|---|
| Article/page title | `font-serif text-3xl font-semibold tracking-tight` |
| Topic group header | `font-serif text-xl font-semibold` |
| Article row title | `font-medium hover:text-[--accent]` |
| Lesson prose | `font-serif` · `max-w-[68ch]` · `leading-relaxed` (1.625) |
| Section label / eyebrow | `text-[11px] uppercase tracking-wider text-[--muted]` |
| Metadata (domain, count) | `text-xs text-[--muted]` |
| Metric value | `font-mono text-2xl font-semibold tabular-nums tracking-tight` |

Enable reading niceties on body: `antialiased`, `font-feature-settings:"kern" 1,"liga" 1`.

## Spacing & shape
- **Radius:** `rounded-md` (6px) default for buttons/inputs/rows; `rounded-2xl`
  (16px) for sheets/modals; `rounded-full` for pills only.
- **Reading measure:** lessons `max-w-[68ch]`; app shell `max-w-5xl` / `max-w-4xl`.
- **Rhythm:** sections `space-y-8`; within `space-y-3`; article rows
  `divide-y divide-[--border]`, `py-3`. Container padding `px-6 py-8`.
- **Elevation:** borders, not shadows. Shadows only on floating/modal surfaces
  (`shadow-lg shadow-black/10`).

## Component specs
**Nav** — sticky, `bg-[--paper]/80 backdrop-blur`, `border-b border-[--border]`,
serif wordmark, tabs Reading / Map / Inference, a `+ Add` accent button, theme toggle.

**Topic group** (Reading) — eyebrow header `font-serif text-xl` + count + a
`🎧 ▶ lesson` affordance; collapsible (`transition-transform` chevron); below it
the article rows.

**Article row** — `flex items-baseline gap-3 py-3`: title (`font-medium
hover:text-[--accent]`), domain (`text-xs text-[--muted]`), optional `Open ↗`
pushed right (`ml-auto`). Divider between rows. No card chrome in the list — keep
it a clean reading index (LibStack pattern).

**Lesson card** — serif prose at `max-w-[68ch]`, a **Verified badge** (below),
and an **audio player**. Open by default for the selected topic.

**Verified badge** (replaces "grounded") — pill, `text-xs font-medium`:
- ✓ `bg-[--verified]/12 text-[--verified]` → "Verified against your sources"
- ⚠ `bg-[--unverified]/12 text-[--unverified]` → "1 claim not in your sources"
Click → expands the specific unsupported sentence. *This* is the grounding demo beat.

**Audio player** — when `audio_path` set: native `<audio controls>` styled minimal;
else a disabled `▶ Audio (coming soon)` pill. The NotebookLM moment.

**Metric panel** (Inference tab) — atlas metric-card pattern: eyebrow label +
`tabular-nums` value. Horizontal stacked tier bar (mostly green), big "≈Nx cheaper
than all-frontier", "% on cheap tier", "N/M claims caught". Caption: "right model,
right GPU, per task."

**+ Add / empty states** — friendly, never lorem. Empty: "Your stack is empty —
add a link or load the demo corpus."

## Motion (restraint)
- Allowed: `transition-colors` on hover/state (~150ms); `animate-pulse` for
  loading; one subtle staggered fade for the graph "bloom" on Map only.
- **Forbidden** (atlas's rules, and what made v1 slop): `transition-all`, rainbow/
  multi-stop gradients, glow shadows, decorative blobs, bouncy easing, fade-in on
  list rows, skeleton morphs. Use the destination layout + pulse.
- Focus: visible `outline: 2px solid var(--accent); outline-offset: 2px` on
  `:focus-visible`.

## Topic graph (Map) — make it sensible
The current graph is a 4-level binary cascade with repeated single-word labels —
it doesn't read as topics. Target instead:
- **Flat:** ~5–7 real top-level topics; at most one rule-gated sub-level
  (`should_split`: big AND incoherent). No 4-deep binaries.
- **Distinct labels:** real LLM `cluster_name` (Wave 2), parent = broad theme,
  children = distinct facets. Never parent==child.
- **Counts** on each node; click filters the Reading list. The graph is a *map of
  the reading*, not the primary structure.

## De-slop checklist (run in design-review)
- [ ] No generic dark-slate + teal. Warm paper/ink + terracotta accent.
- [ ] Serif on titles & lesson prose; sans chrome; mono numbers.
- [ ] Borders over shadows; one accent hue; semantic colors only where they mean something.
- [ ] Plain language everywhere ("Verified against your sources", not "grounded").
- [ ] Reading list is the home screen; graph + metrics are tabs.
- [ ] Motion is colors-only + one bloom; nothing bounces or glows.

## References
- `~/Desktop/Code/LibStack` — backbone (palette, serif, measure, list/cluster pattern)
- `~/Desktop/Code/sameerhimati.github.io` — editorial restraint, accent discipline
- `~/Desktop/Code/atlas/web` — metric-card / data discipline, `DESIGN.md`, de-slop rules
