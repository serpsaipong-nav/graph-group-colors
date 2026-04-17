# CLAUDE.md

This file gives Claude (and other AI coding assistants) the context needed to work productively on this repository. Read it before making non-trivial changes.

## Project: Multi-Color Graph Nodes for Obsidian

An Obsidian plugin that renders nodes in the graph view with **multiple colors** when a note matches multiple color groups. The core graph view only shows the color of the *first* matching group; this plugin divides the node into colored segments so every matching tag/group is visible.

**Three simultaneous priorities** (not one goal with two nice-to-haves — all three are P0):

1. **Multi-color rendering works correctly.** A note in N groups shows N color slices.
2. **Minimal impact on Obsidian.** Read-only access to core, one patch point, fully restorable on disable, fail-safe on unexpected shape, crash-safe. Disabling the plugin leaves the graph pixel-identical to stock.
3. **Performance-neutral by default, performance-positive on opt-in.** Zero work for nodes that don't need multi-color (which is the majority). Opt-in features (throttling, culling, caps) that can make large-vault graph views faster than stock on explicit user trade-offs.

### Problem in one sentence

In Obsidian core, a note tagged `#databricks` and `#medium` only gets one color in graph view. This plugin makes that same node show both colors, without slowing anything down or changing anything else about the graph.

### Non-goals

- Not a full graph-view replacement (see Extended Graph, Juggl).
- Not changing link/edge colors.
- Not changing layout, physics, or node positioning.
- Not rewriting Obsidian's force simulation to make it faster. The plugin cannot do that. It can only skip its own work or skip updating things the user has opted to skip.
- Not mobile at v1.

## The three invariants

These are checked by acceptance tests. Break one and the test suite fails.

### Invariant 1: Additive, not substitutive

Obsidian's renderer keeps picking the first-match color as always. The plugin draws N slices **over** the base node. When disabled, the base color is visible again, unmodified. The plugin never changes what Obsidian draws — it only adds on top.

### Invariant 2: Fail safe, always restorable

- One patch point: `renderer.renderCallback` on each graph view instance. Nothing else.
- Every internal access is preceded by a shape check. Mismatch → warn, don't patch, graph works as stock.
- Every per-frame code path is in an error boundary. 5 consecutive errors → session-disable overlays; graph works as stock.
- Unload restores the original callback in try/finally. Enable/disable 10 times leaks nothing.

### Invariant 3: Pay for what you use

The per-frame hot path, per node:

```
if (node has 0 or 1 matching groups) → continue        // zero work, majority case
if (culling on && node off-screen) → continue
if (throttle on && not a draw frame) → continue
→ draw or update overlay
```

Nodes that don't need multi-color cost essentially nothing (< 0.1 ms/frame for 500 such nodes). This is both the isolation guarantee *and* the perf guarantee — they reduce to the same thing.

## Architecture at a glance

Obsidian's core graph view renders nodes via **PIXI.js** onto a canvas. There is **no public, stable API** for customizing node rendering — the plugin hooks the internal renderer.

Four layers:

1. **Isolation layer** (`utils/obsidianInternals.ts`) — every bit of non-public access. Typed wrappers, shape checks, fail-safe. When Obsidian updates, there's one file to audit.
2. **Group resolution** (`graph/GroupResolver.ts`) — pure TypeScript, no Obsidian runtime needed for tests. Given a file, return its ordered list of group colors.
3. **Renderer hook** (`graph/GraphViewHook.ts`) — attaches to graph views, patches the render callback behind the isolation layer, runs everything in an error boundary.
4. **Overlay drawing** (`graph/NodeOverlay.ts`) — pooled PIXI `Graphics` per node, zero allocation in steady state.

Key files (planned):

```
src/
  main.ts                 # Plugin entry, lifecycle
  settings/
    SettingsTab.ts        # Plugin settings UI
    settings.ts           # Type, defaults, load/save, schemaVersion
  graph/
    GraphViewHook.ts      # Per-view attach/detach, error boundary, circuit breaker
    GroupResolver.ts      # Reads graph.json colorGroups, matches notes → groups
    NodeOverlay.ts        # PIXI rendering of multi-color segments (pooled)
    ColorCache.ts         # Memoized (file → ordered group colors) with invalidation
    perf/
      Throttle.ts         # Frame throttling for simulation-active state
      ViewportCull.ts     # Bounds check for off-screen nodes
      OverlayCap.ts       # Disable overlays above N visible nodes
  utils/
    obsidianInternals.ts  # ALL internal access, typed and shape-checked
    logger.ts             # console warnings with [MCGN] prefix
tests/
  GroupResolver.test.ts
  NodeOverlay.test.ts
  fixtures/
    vault/                # Synthetic test vault
    large-vault-gen.ts    # 5,000-node vault generator for perf tests
manifest.json
versions.json
esbuild.config.mjs
```

## Critical constraints when coding

### Always

- **Read, don't mutate.** Plugin accesses core state read-only. If you find yourself writing to a core object, stop and use an overlay instead.
- **Shape-check before use.** Every internal access goes through `obsidianInternals.ts` and checks shape first. No direct property reads in the rest of the codebase.
- **Wrap per-frame code.** Every code path invoked from the render callback is in try/catch.
- **Skip cheaply.** The first few lines of per-node code are early returns for "nothing to do." The common case must cost near-zero.

### Never

- Never modify `graph.json`, `workspace.json`, or any core Obsidian file.
- Never patch a function other than `renderer.renderCallback`. One patch point, forever.
- Never allocate in the render callback's hot path. No `new`, no array literals, no string concat, no `.map` / `.filter`. Reuse pooled objects.
- Never use `any` outside `obsidianInternals.ts`. That file is the only place types escape.
- Never assume Obsidian internals are stable. Anything Obsidian doesn't document can change in any release — code must handle shape mismatch gracefully.

## Obsidian group definition format (reference)

Color groups live in `.obsidian/graph.json` under `colorGroups`:

```json
{
  "colorGroups": [
    { "query": "tag:#databricks", "color": { "a": 1, "rgb": 14701138 } },
    { "query": "tag:#medium",     "color": { "a": 1, "rgb":  5431500 } }
  ]
}
```

`query` uses the same search syntax as Obsidian's search bar. We evaluate via Obsidian's search API, not a re-implementation.

## Dev workflow

```bash
npm install
npm run dev       # esbuild watch, outputs to test vault
npm run build     # production build
npm test          # vitest (pure logic only)
npm run test:perf # synthetic vault perf harness
```

Hot-reload: symlink `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/multicolor-graph-nodes/` and use the `hot-reload` community plugin in the dev vault.

## When working on this repo

1. **Before changing rendering:** read `src/graph/NodeOverlay.ts` end-to-end. The render callback is the hot path. A stray allocation there is a perf bug, full stop.
2. **Before changing group resolution:** check `GroupResolver.test.ts`. Matching has edge cases (nested tags, property tags, negated queries, invalid queries).
3. **Before touching internals:** look at Extended Graph and Graph Link Types — both are public repos and are the load-bearing prior art. They also patch `renderer.renderCallback`.
4. **Before adding a setting:** ask whether it changes correctness or just trade-off. If the latter, it's a perf setting and should live in the perf section with a clear trade-off description.
5. **Never commit** the test vault, `.obsidian/workspace.json`, or anything with a user's notes.

## Testing philosophy

- **Pure logic is unit-tested.** Query parsing, group matching, color segment math, throttling logic — no Obsidian needed.
- **Rendering is manually tested** in a dev vault with 3 seeded groups and ~500 notes. Check: correct segments, hover works, links still render, no frame drops, disable restores original.
- **Isolation is explicitly tested.** Inject thrown errors, inject shape mismatches, run enable/disable cycles — all verify the invariants above.
- **Perf is measured on a synthetic 5,000-node vault** generated by `tests/fixtures/large-vault-gen.ts`. Compare before/after with and without opt-in perf features.
- **Regression corpus:** `tests/fixtures/vault/` covers: no tags, one-tag one-group, multi-tag multi-group, zero match, property tags, nested tags, invalid queries.

## Style

- TypeScript strict. No `any` outside `obsidianInternals.ts`.
- Small files, named exports, no default exports.
- Console logs prefixed `[MCGN]` for easy user-report filtering.
- No runtime dependencies beyond `obsidian`. PIXI is already loaded by the graph view — reuse it, do not bundle a second copy.

## See also

- `spec.md` — what the plugin does, user-facing behavior, acceptance tests (20 of them, grouped into functional / isolation / performance).
- `plan.md` — implementation plan, milestones (M0–M5), risks, effort estimate.
