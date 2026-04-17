# plan.md — Multi-Color Graph Nodes

**Status:** Draft v0.2
**Last updated:** 2026-04-16
**Target v1.0:** ~7 weekends solo effort

---

## 1. Approach overview

Four layers, built bottom-up:

1. **Isolation layer** — wrappers around all internal Obsidian access. One place to break, one place to fix. Every function that touches non-public internals lives here and is defensive about shape.
2. **Group resolution layer** — pure TypeScript. Given a file, return the ordered list of group colors it matches. Fully unit-testable, no Obsidian runtime required.
3. **Renderer hook layer** — attaches to each open graph view, patches exactly one function (the per-frame render callback), exposes a clean callback `(node, x, y, radius) => void`. Wrapped in error boundary.
4. **Overlay drawing layer** — uses PIXI (already loaded by Obsidian) to draw pie slices on top of each node. Zero work for nodes that don't need multi-color.

Each layer developed and tested independently before integration.

## 2. Core design principles (enforced throughout)

These are not aspirational; they gate PR merges.

1. **Read, don't mutate.** The plugin reads Obsidian state via public and (carefully) internal APIs. It never writes back to core objects. If you find yourself assigning to a core property, stop — wrap or overlay instead.
2. **One patch point, ever.** The plugin monkey-patches exactly `renderer.renderCallback` on graph view instances. No other patches.
3. **Fail safe on shape mismatch.** Every internal access is preceded by a shape check. Mismatch → warn, don't patch, return. The graph keeps working as stock.
4. **Fail safe on runtime error.** Every per-frame code path is wrapped in try/catch. 5 consecutive errors in a session → overlays auto-disable for the rest of the session.
5. **Always restorable.** Every patch stores its original. Unload restores. Verified by the "enable/disable cycle leaks nothing" acceptance test.
6. **Pay for what you use.** Nodes that match 0 or 1 group get no plugin work — no allocation, no draw call, nothing. This is both the isolation invariant (plugin is invisible when not needed) and the perf invariant (no tax on users who don't use multi-color).

## 3. Milestones

### M0 — Spike (1 weekend)

**Goal:** prove we can attach, overlay, and cleanly unload.

- Clone `obsidian-sample-plugin`, set up dev loop with hot-reload.
- Open graph view, find the live `GraphView` via `app.workspace.getLeavesOfType('graph')`.
- Inspect renderer in DevTools: confirm `renderCallback`, node collection, node fields (`id`, `x`, `y`, `r`, `circle`).
- Patch render callback to draw a red square next to every node. Ship nothing.
- **Critical spike:** enable/disable 10 times. Confirm:
  - Red squares appear on enable.
  - Red squares disappear on disable.
  - No console errors.
  - No PIXI objects leaked (check via heap snapshot).
- **Critical spike:** simulate renderer shape mismatch — temporarily rename `renderCallback` in memory. Confirm plugin fails safe with a console warning and the graph still works.

**Exit criteria:** enable/disable/crash-simulation cycle leaves stock graph working identically. This is the isolation guarantee in miniature.

### M1 — Group resolution (1 weekend)

**Goal:** given a note, return its ordered list of group colors.

- Implement `GroupResolver.loadGroups()`, `resolveForFile(file)`.
- Read `.obsidian/graph.json` via `app.vault.adapter.read`.
- Parse `colorGroups[].query` and `.color`.
- Query evaluation: use Obsidian's internal search plugin if accessible. Fallback: minimal parser for `tag:`, `path:`, `file:`, `-` negation, AND (space).
- Unit tests with fixture vaults: tag, nested tag, path, property tag, multi-tag match, zero match, invalid query.

**Exit criteria:** `resolveForFile(file)` returns correct ordered `{ color, alpha }[]` for every fixture. No Obsidian runtime required for tests.

### M2 — Overlay rendering (1 weekend)

**Goal:** draw N colored slices on one node, correctly sized, correctly positioned, with minimal allocation.

- Implement `NodeOverlay.draw(node, colors)`, `clear(node)`, `destroy()`.
- For each node with ≥2 colors, create one pooled PIXI `Graphics`, parented to the node's container.
- Drawing math: N arcs at `2π/N` radians each, start angle `-π/2` (top).
- Redraw when node radius, position, or colors change. Skip when nothing changed.
- **Zero-allocation hot path:** no `new`, no array literals, no string concat inside the render callback. Pool all graphics objects.
- **Zero work for 0/1-color nodes:** early return before any PIXI touch.

**Exit criteria:** 3-color test node renders as 3 equal slices, stays aligned during zoom/pan/simulation. Memory heap stable across 60 seconds of active simulation.

### M3 — Integration & per-view lifecycle (1 weekend)

**Goal:** all four layers wired together, survives view open/close, handles metadata/vault events.

- `GraphViewHook` listens for graph-view leaves, attaches/detaches per view.
- Error boundary wrapping every per-frame path. 5-consecutive-errors circuit breaker.
- Wire events: `MetadataCache.on('changed')`, `Vault.on('rename' | 'delete' | 'create')`, file-watch on `graph.json`.
- Settings tab with: enable per-view, max colors per node, kill switch.
- **Fuzz test:** randomly open/close graph views, toggle kill switch, rename files — for 2 minutes. No crashes, no leaks.

**Exit criteria:** acceptance tests 1–15 pass on a 500-note test vault.

### M4 — Performance validation and opt-in features (1 weekend)

**Goal:** meet plugin-overhead targets AND ship the first tier of opt-in perf features.

**Phase 1: validate overhead budget.**

- Build a synthetic 5,000-node vault generator (script in `tests/fixtures/`).
- Profile at 500 and 2,000 visible nodes using Obsidian DevTools perf panel.
- Identify hot spots; optimize allocations and draw-call count.
- Confirm targets met: < 1 ms / < 4 ms / < 0.1 ms for the three overhead cases.

**Phase 2: ship opt-in perf features.**

- **Throttle redraws during simulation.** Track node delta; if simulation is active, update overlays every Nth frame (configurable, default 2).
- **Cull nodes outside viewport.** Compute viewport bounds from renderer transform; skip overlay updates for nodes outside bounds.
- **Maximum nodes with overlays.** When visible count > threshold, disable overlays (bail to stock).
- **Lazy overlay creation.** Don't pre-allocate; create on first frame a node is visible.
- **Debounced group re-evaluation.** After metadata change, wait 200 ms before recomputing.

All off by default. Each has a settings-tab entry with a one-line trade-off explanation.

**Exit criteria:** acceptance tests 16–18 pass (overhead budgets). Tests 19–20 pass (perf features measurable, large vault opens).

### M5 — Release prep (1 weekend)

- README with: what it does, how to install, GIF demo, known limitations (explicit list of what we don't do), isolation guarantees, perf targets.
- `manifest.json` polish.
- Submit to `obsidianmd/obsidian-releases`.
- Forum announcement.

## 4. Technical details

### 4.1 Attaching to the renderer (with isolation)

```ts
// Inside obsidianInternals.ts — single-file containment of all internal access.

interface RendererShape {
  renderCallback: Function;
  nodes: Array<{ id: string; x: number; y: number; r: number; circle: any }>;
  px: any; // PIXI stage
}

function validateRenderer(r: any): r is RendererShape {
  return typeof r?.renderCallback === 'function'
      && Array.isArray(r?.nodes)
      && r?.px != null;
}

export function attachRenderer(view: any, onFrame: (r: RendererShape) => void) {
  const r = view?.renderer;
  if (!validateRenderer(r)) {
    console.warn('[MCGN] Unexpected renderer shape — skipping attach');
    return () => {};
  }
  const original = r.renderCallback;
  let errCount = 0;
  r.renderCallback = function (...args: any[]) {
    original.apply(this, args);
    try {
      onFrame(r);
    } catch (e) {
      errCount++;
      console.error('[MCGN] Frame error', e);
      if (errCount >= 5) {
        console.warn('[MCGN] Too many errors — disabling overlays for session');
        r.renderCallback = original;
      }
    }
  };
  return () => { r.renderCallback = original; };
}
```

Everything internal lives behind a typed wrapper. When Obsidian updates, there's exactly one file to audit.

### 4.2 Zero-allocation per-frame path

The render callback runs at 60 fps. No new objects in steady state:

- Color arrays pooled per-file, invalidated on metadata change.
- PIXI `Graphics` objects pooled per-node, reused across frames.
- Viewport bounds computed once per frame, stored in a single reusable object.
- No `Array.filter`/`.map` inside the per-node loop — plain `for` loops only.

### 4.3 Skip logic (pay-for-what-you-use)

Per frame, for each node:

```
  if (node has 0 or 1 matching groups) → do nothing, continue
  if (culling on && node outside viewport) → continue
  if (throttle on && not on a draw frame) → continue
  → update or draw this node's overlay
```

The most common case (0 or 1 group) exits immediately. Plugin overhead for a vault with no multi-color notes is essentially "iterate a list and skip each item" — measured as < 0.1 ms for 500 nodes.

### 4.4 Invalidation

Color cache keyed by `file.path`:

- `metadataCache.on('changed', file)` → invalidate that file.
- `vault.on('rename', file, oldPath)` → invalidate both paths.
- `vault.on('delete', file)` → remove entry.
- `graph.json` modified → full cache flush + full redraw.

All invalidations debounced per §5.6 of spec.

### 4.5 Settings storage

Standard `Plugin.loadData()` / `saveData()` → `data.json`. Versioned schema (`settings.schemaVersion: 1`).

## 5. Risks and mitigations


| #   | Risk                                                   | Likelihood | Impact       | Mitigation                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | ---------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Obsidian changes internal renderer shape               | Med        | High         | All internal access isolated in `obsidianInternals.ts`. Shape check + fail-safe on mismatch. Smoke test on every Obsidian version.                                                           |
| R2  | Plugin adds perceivable overhead                       | Med        | High         | "Pay for what you use" architecture — zero work for 0/1-color nodes. Perf budgets enforced in M4 acceptance tests.                                                                           |
| R3  | Plugin cannot actually speed up large-vault graph view | High       | Med          | Set honest expectations in spec/README. Ship opt-in features with measured improvements, clear trade-offs. Don't market as "makes your graph fast."                                          |
| R4  | Internal search API unstable                           | Low        | Med          | Fallback query parser for `tag:`, `path:`, `-`, AND. Covers ~90% of real group queries.                                                                                                      |
| R5  | PIXI version mismatch                                  | Low        | Med          | Use only API common to PIXI v5–v7. Feature-check at init, fail safe on mismatch.                                                                                                             |
| R6  | Overlay draws over focus ring                          | Med        | Low          | M0 spike confirms z-order; parent below focus ring if needed.                                                                                                                                |
| R7  | graph.json write races with plugin read                | Low        | Low          | Read on file-watch event, debounced 200 ms. Plugin never writes.                                                                                                                             |
| R8  | Plugin crash breaks graph view                         | Low        | **Critical** | Error boundary wrapping every per-frame path. 5-error circuit breaker. Unload always restores original callback in try/finally. Acceptance test: inject thrown error, verify view continues. |
| R9  | Opt-in perf features interact badly                    | Low        | Med          | Integration tests for every combination. Features designed to be composable and independent.                                                                                                 |
| R10 | Color-only info bad for colorblind users               | High       | Low          | Respect user's chosen colors. Optional hover tooltip in v1.x.                                                                                                                                |


## 6. Decisions to lock before M1

- **Search API vs. own parser.** Spike in M0 — if `internalPlugins.getPluginById('global-search')` works, use it.
- **Slice order rule.** Group definition order (spec §6.2). Lock this in.
- **Error-boundary threshold.** 5 consecutive per-frame errors → session-disable overlays. Confirm in M3.
- **Default for "Maximum nodes with overlays."** Unlimited — users opt in to the cap. Confirm in M4.

## 7. What "done" looks like for v1.0

- **All 20 acceptance tests pass** (6 functional + 9 isolation + 5 performance).
- **Overhead budgets met** on a 5,000-node synthetic vault on author's machine.
- **Near-zero overhead** when zero notes have multiple matching groups (< 0.1 ms/frame).
- **No core-file modification** — verified by byte-identical `graph.json`/`workspace.json` after enable/use/disable.
- **No memory leaks** after 10 enable/disable cycles.
- **README is honest** about what the plugin does and doesn't improve.
- **Two weeks of dogfooding** in author's own vault without a crash.
- **Submitted to community plugin directory.**

## 8. What's deferred (v1.x backlog)

- Ring / stack render styles beyond pie.
- Mobile support.
- Per-group slice weight.
- Hover tooltip listing matching groups.
- Exclude-from-overlay per-group setting.
- Adaptive perf (auto-enable features based on vault size).
- Integration test harness with headless Electron.

## 9. Effort estimate


| Milestone                            | Weekends | Cumulative |
| ------------------------------------ | -------- | ---------- |
| M0 Spike (+ isolation invariants)    | 1        | 1          |
| M1 Group resolution                  | 1        | 2          |
| M2 Overlay rendering (+ zero-alloc)  | 1        | 3          |
| M3 Integration (+ error boundaries)  | 1        | 4          |
| M4 Perf validation + opt-in features | 2        | 6          |
| M5 Release prep                      | 1        | 7          |


7 weekends solo. Add ~25% buffer (9 weekends) for unknowns — internal API drift is the biggest one, perf optimization iterations the second.

## 10. Parallel execution plan (3 agents)

Use three implementation agents in parallel to maximize speed while keeping merge conflicts manageable.

### Agent A — Isolation and renderer hook (foundation branch)

- Branch: `agent-a/isolation-hook`
- Owns:
  - `src/utils/obsidianInternals.ts`
  - `src/graph/GraphViewHook.ts`
- Scope:
  - Shape checks for all internal access.
  - Patch exactly one function: `renderer.renderCallback`.
  - Teardown/restoration guarantees.
  - Per-frame error boundary and 5-error circuit breaker.
- Done criteria:
  - Safe fail on shape mismatch.
  - Enable/disable cycles cleanly restore stock behavior.

### Agent B — Group resolution and cache (data branch)

- Branch: `agent-b/resolver-cache`
- Owns:
  - `src/graph/GroupResolver.ts`
  - `src/graph/ColorCache.ts`
  - `tests/GroupResolver.test.ts`
- Scope:
  - Load and parse `.obsidian/graph.json` color groups.
  - Ordered matching by group order.
  - Invalid query tolerance.
  - Cache invalidation semantics for metadata and file events.
- Done criteria:
  - Resolver tests pass across edge-case fixtures.
  - Output shape stable and integration-ready.

### Agent C — Overlay and perf modules (render branch)

- Branch: `agent-c/overlay-perf`
- Owns:
  - `src/graph/NodeOverlay.ts`
  - `src/graph/perf/Throttle.ts`
  - `src/graph/perf/ViewportCull.ts`
  - `src/graph/perf/OverlayCap.ts`
  - `tests/NodeOverlay.test.ts`
- Scope:
  - Draw N-slice node overlays for N >= 2.
  - Early return for 0/1-group nodes.
  - Lazy overlay creation and per-frame skip logic.
  - Opt-in perf feature modules.
- Done criteria:
  - Rendering correctness for slice math and alignment.
  - Skip/perf behavior validated in tests and manual profiling.

### Merge and integration order

1. Merge Agent A first (establishes runtime contracts and safety boundaries).
2. Merge Agent B and Agent C next (in either order, rebasing onto merged A).
3. Run a short integration pass on `feature/mcgn-core`:
  - Wire `src/main.ts`.
  - Add `src/settings/settings.ts` and `src/settings/SettingsTab.ts`.
  - Connect invalidation events and kill switch.
4. Run baseline acceptance checks (functional + isolation before full perf pass).

## 11. How to run the 3-agent workflow

Use git worktrees so each agent can work in parallel without stomping on files.

1. From repo root, create three worktrees:
  - `git checkout -b feature/mcgn-core`
  - `git worktree add ../graph-group-colors-agent-a -b agent-a/isolation-hook`
  - `git worktree add ../graph-group-colors-agent-b -b agent-b/resolver-cache`
  - `git worktree add ../graph-group-colors-agent-c -b agent-c/overlay-perf`
2. Open one Cursor window per worktree.
3. In each window, run:
  - `npm install`
  - `npm run dev` (or `npm run build` for non-watch sessions)
  - `npm test` for logic tests
4. Give each agent only its branch scope from section 10 and require small, frequent commits.
5. Merge flow:
  - Merge `agent-a/isolation-hook` into `feature/mcgn-core` first.
  - Rebase `agent-b/resolver-cache` and `agent-c/overlay-perf` onto updated `feature/mcgn-core`.
  - Merge B and C.
6. After merges, run on integration branch:
  - `npm run build`
  - `npm test`
  - `npm run test:perf` (when perf harness is available)
7. Manual Obsidian checks before release:
  - Enable plugin, verify overlay behavior in global and local graph.
  - Toggle kill switch and plugin enable/disable repeatedly.
  - Confirm no residue and stock behavior restoration.

