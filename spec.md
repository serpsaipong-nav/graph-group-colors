# spec.md — Multi-Color Graph Nodes

**Status:** Draft v0.2
**Owner:** Pong
**Last updated:** 2026-04-16

---

## 1. Summary

An Obsidian plugin that renders each node in the graph view with **all** of the colors of the groups it matches, instead of only the first. Nodes that match two groups appear as two-color segments; three groups → three segments; and so on. Nodes that match zero or one group look exactly as they do today.

Two equally important design principles sit alongside the multi-color feature:

- **Minimal footprint on Obsidian.** The plugin reads core state but never mutates it. It patches exactly one function (the render callback), owns its own PIXI objects, and restores everything on unload. If the plugin crashes, the graph view keeps working.
- **Performance-positive where possible.** The plugin adds negligible per-frame cost, *and* includes opt-in features (node culling, redraw throttling, simulation cap) that can make large-vault graph views faster than stock.

## 2. Motivation

Obsidian's graph view supports color groups, but when a note matches multiple groups only the **first matching group** wins and the others are invisible. For users who tag notes with overlapping categories (e.g., `#databricks` plus `#medium`), this loses real information — two different classifications collapse into one color.

A secondary motivation: graph view performance degrades significantly on large vaults. While the plugin cannot rewrite Obsidian's core graph engine, it can offer optional knobs that help.

## 3. Goals

### Functional

- **G1.** A node matching N groups shows N visible colors, one per group.
- **G2.** Node position, size, links, labels, hover, drag, and click-to-open behave identically to the core graph view.
- **G3.** Reuses the existing group definitions from `.obsidian/graph.json` — no duplicate configuration.
- **G4.** Works for both the global graph view and local graph views.

### Isolation (how little we affect Obsidian)

- **G5.** When the plugin is disabled or uninstalled, the graph looks and behaves **pixel-identical** to stock Obsidian. No residue, no leaked objects, no persistent state in core files.
- **G6.** The plugin patches at most **one** function on the internal renderer. All other access is read-only.
- **G7.** If the plugin encounters an unexpected internal shape (Obsidian upgrade, edge-case view), it fails **safe**: logs a warning, does not patch, does not render overlays. The graph view continues to work as stock.
- **G8.** The plugin never modifies `graph.json`, `workspace.json`, or any core Obsidian file. It only reads them.
- **G9.** A crash in the plugin's render path does not crash the graph view. Every per-frame code path is wrapped in an error boundary.

### Performance

- **G10.** Plugin's per-frame overhead is **< 1 ms** at 500 visible nodes and **< 4 ms** at 2,000 visible nodes on a typical laptop.
- **G11.** The plugin includes **opt-in** features that can improve graph-view perf on large vaults beyond stock behavior (see §5.6).
- **G12.** The plugin has a **kill switch**: a setting that disables all rendering and all patches in-memory, without needing to disable the plugin in Community Plugins.

## 4. Non-goals

- **NG1.** Changing link/edge colors based on tags.
- **NG2.** Changing node *shape* (circle → square, icons, images).
- **NG3.** Defining new groups via plugin settings. The plugin reads Obsidian's groups.
- **NG4.** Mobile support at v1.
- **NG5.** Colors in the outline/side panels or any view other than Graph View.
- **NG6.** Rewriting or replacing Obsidian's force simulation. Perf features are filters and throttles, not a new physics engine.
- **NG7.** Making a vault with performance issues suddenly performant. Large-vault perf fundamentally comes from the core engine; the plugin can help at the margins, not transform it.

## 5. User-facing behavior

### 5.1 Happy path

1. User opens Graph Settings → Groups and defines:
   - Group A: `tag:#databricks` → blue
   - Group B: `tag:#medium` → orange
2. A note `docs/sql-tips.md` has both `#databricks` and `#medium`.
3. The node for that file appears as a **circle split into two semicircles** — blue on one half, orange on the other.
4. A note with only `#databricks` is fully blue. A note with only `#medium` is fully orange. A note with neither is the default color.

### 5.2 Three or more groups

A node matching N groups is drawn as N equal-angle slices (120° for three, 90° for four, and so on).

**Slice order** follows the group order in Obsidian's Groups UI (top-to-bottom). Drag groups to reorder slices.

### 5.3 Zero or one group

- Zero groups: default node color, the plugin draws nothing.
- One group: identical to stock Obsidian, the plugin draws nothing.

This is an important perf property: **the plugin does zero rendering work for nodes that don't need multi-color**, which is usually the majority.

### 5.4 Interaction with node state

- **Dimmed nodes:** slices dimmed to Obsidian's faded alpha.
- **Hovered/highlighted:** slices at full opacity, inheriting Obsidian's scale change.
- **Unresolved (broken links):** stock — no tags → no overlay.

### 5.5 Multi-color settings

| Setting | Default | Description |
|---|---|---|
| Enabled views | Global + Local | Toggle global and local graph views independently. |
| Render style | `pie` | v1 ships `pie` only. |
| Maximum colors per node | 6 | Cap: if a note matches more groups, only the first N apply. |
| Plugin kill switch | Off | When on, plugin does nothing: no patches, no rendering. For A/B comparisons. |

### 5.6 Performance settings (opt-in)

Off by default — they change graph behavior, so users must opt in knowingly. Each has a one-line explanation in settings UI.

| Setting | Default | What it does | Trade-off |
|---|---|---|---|
| Cull nodes outside viewport | Off | During simulation, skip updating overlays for off-screen nodes. | Overlays pop in on scroll. |
| Throttle redraws during simulation | Off | Update overlays every 2nd or 3rd frame instead of every frame. | Minor visual lag during simulation; no effect when settled. |
| Maximum nodes with overlays | Unlimited | When visible node count exceeds this, overlays disabled entirely (stock rendering resumes). | Multi-color stops working above threshold. |
| Debounce group re-evaluation | 200 ms | After a metadata change, wait N ms before recomputing affected overlays. | Color updates slightly delayed after editing tags. |
| Lazy overlay creation | On | Overlays created only on first appearance of a node. | Very slight first-frame cost on pan. |

Each of these shifts perf, not correctness. None of them change what multi-color means when it *is* rendered.

**Important:** none of these affect stock Obsidian behavior when the plugin is disabled. They only control the plugin's own overhead and the plugin's own culling.

## 6. Semantic rules

### 6.1 Matching rules

A note matches a group iff Obsidian's search evaluates the group's `query` as true. We reuse Obsidian's search semantics exactly — no re-implementation.

Implication: `tag:#databricks` matches any note whose metadata includes `#databricks`, including nested tags like `#databricks/spark`. Complex queries like `tag:#databricks path:"work/"` are supported.

### 6.2 Group ordering

Slices follow `graph.json` → `colorGroups` order (the same order shown in the Groups UI).

### 6.3 "First-match" color vs. overlay — why this matters for isolation

Obsidian's renderer still picks a single first-match color for each node. The plugin does not change that. We draw colored slices **over** the base node, fully covering it. When the plugin is disabled, the base color becomes visible again unchanged.

This invariant is what makes the plugin safely removable. It's also why the plugin can cheaply "bail out" at any time — stop drawing and the stock graph is already underneath.

### 6.4 Color resolution

Group colors in `graph.json`:

```json
{ "color": { "a": 1, "rgb": 14701138 } }
```

Converted to 24-bit hex for PIXI. Alpha respected.

### 6.5 Edge cases

| Case | Behavior |
|---|---|
| Note with no tags, matches no group | Default color, no overlay drawn. Plugin does zero work for this node. |
| Note matches via `path:` (not tags) | Included — group matching is not tag-specific. |
| Tag as YAML property (not inline `#tag`) | Included — `MetadataCache` exposes both. |
| Group query invalid / unparseable | Group ignored silently; dev-build log. |
| Two groups same color | Two slices same color; matches user data. |
| Group added / removed while view open | Overlay updates next frame (debounced per §5.6). |
| Note renamed, moved, deleted | Cache invalidated, overlay refreshed next frame. |
| File has 10+ matching groups | Clamped to max colors per node. |
| Attachments | Same matching as core. |
| Orphan/unresolved nodes | No metadata → no match → default. |
| **Internal renderer shape unexpected** | **Fail safe: no patches, graph renders as stock, warning logged.** |
| **Plugin throws in per-frame code** | **Error boundary catches; frame skipped; graph continues. After 5 consecutive errors, overlays auto-disable for the session.** |
| **PIXI version mismatch** | **Detected via feature check at init; unsupported → fail safe.** |

## 7. Out-of-scope interactions

The plugin must **not**:

- Intercept mouse or keyboard events.
- Change node x/y coordinates.
- Modify the force simulation.
- Draw over node labels.
- Render on any view other than Graph View and Local Graph View.
- Persist any data outside its own `data.json`.
- Modify `graph.json`, `workspace.json`, or any core file.
- Monkey-patch any function beyond `renderer.renderCallback` on graph view instances.

## 8. Performance targets

### 8.1 Plugin overhead (additive cost on top of stock)

| Metric | Target |
|---|---|
| Overhead at 500 nodes, all multi-color | < 1 ms M-series Mac; < 2 ms 2019 Intel |
| Overhead at 2,000 nodes, all multi-color | < 4 ms M-series; < 8 ms Intel |
| Overhead at 500 nodes, 0% multi-color | **< 0.1 ms** (near-zero) |
| Memory overhead | < 50 MB at 5,000-node vault |
| Initial attach latency | < 150 ms on 5,000-node vault |
| Unload latency (disable → full restoration) | < 50 ms |

The "0% multi-color" row is the critical isolation metric: **users with no multi-group notes should pay essentially nothing for having the plugin installed.**

### 8.2 Net graph-view perf with opt-in features (vs. stock)

With all opt-in perf features enabled on a 5,000-node vault:

| Scenario | Target vs. stock |
|---|---|
| Idle (simulation settled), panning | Within ±10% |
| Active simulation (first few seconds of view open) | **20–40% faster frame time** via throttling/culling |
| Large-vault open latency | Roughly equal (plugin adds ~100 ms) |

These are **targets, not promises.** Actual numbers depend on vault shape, hardware, and core-engine behavior. The plugin cannot make the core engine itself faster; it can only skip work when users opt in to trade-offs.

### 8.3 What the plugin does NOT claim to improve

- Cold-start time of graph view.
- Layout convergence speed of the force simulation (core, we don't touch it).
- Memory use of Obsidian's core node/edge storage.
- Any view other than graph view.

## 9. Acceptance tests

### Functional

1. **Single color invariant.** One-group note: pixel-identical to stock.
2. **Two-color case.** Two semicircles in group-order.
3. **Three+ colors.** N slices in group-order.
4. **Local graph.** Multi-group rendering works in local view.
5. **Group reorder.** Reordering groups reorders slices next redraw.
6. **Invalid query tolerated.** Malformed query doesn't crash; other groups render.
21. **No overlay leak on node-set change.** Open local graph on note A whose neighborhood includes multi-color nodes, then switch to note B with a disjoint neighborhood. Within one render frame, no overlay PIXI Graphics from A's nodes remain attached to the stage. Verified by `NodeOverlay.getOverlayCount()` reflecting only B's multi-color nodes after the next frame.

### Isolation

7. **Disable restores stock.** Disable plugin, reopen graph view → pixel-identical to never-installed.
8. **Uninstall restores stock.** Same after full uninstall.
9. **Kill switch restores stock.** Enable kill switch without disabling plugin → pixel-identical to disabled.
10. **Crash tolerance.** Injected thrown error in per-frame code triggers error boundary; view continues; error logged.
11. **Shape-mismatch tolerance.** Fake renderer missing expected fields → fail-safe mode; no patches; view works as stock.
12. **Interactions unchanged.** Hover, drag, click-to-open, shift-click, CMD-scroll zoom, focus-mode dimming all identical.
13. **Links unchanged.** Link colors, thickness, arrows, endpoints identical.
14. **No core-file modification.** After enable/use/disable: `.obsidian/graph.json` and `workspace.json` byte-identical.
15. **Enable/disable cycle leaks nothing.** 10 cycles → no leaked PIXI objects; heap returns to baseline.

### Performance

16. **Overhead budget at 500 nodes.** Measured ≤ target.
17. **Overhead budget at 2,000 nodes.** Measured ≤ target.
18. **Near-zero overhead when no multi-color.** Zero multi-group notes → < 0.1 ms/frame overhead.
19. **Perf features reduce work measurably.** All opt-in features on vs. off → measurably lower frame time during active simulation on 5,000-node vault.
20. **Large vault opens.** 5,000-node vault opens global graph view without hang or crash.

## 10. Rollout

- **v0.1 Alpha:** global graph view, pie rendering, isolation invariants, tests 1–15 passing. No perf features yet.
- **v0.2 Beta:** local graph view, settings tab, throttling feature, tests 1–18 passing.
- **v0.3 Beta:** remaining perf features, tests 19–20 passing.
- **v1.0:** submitted to Obsidian community plugin directory.
- **v1.x:** ring/stack styles, mobile evaluation, hover tooltips.

## 11. Open questions

- **Q1.** Does Obsidian's renderer expose a "post-node" draw callback, or must we patch `renderCallback`?
- **Q2.** How does the core renderer handle the "focus ring" on the active node? Our overlay must not hide it.
- **Q3.** Should slice order within a node be configurable per-group? Deferred to v1.x.
- **Q4.** Does "cull nodes outside viewport" conflict with any core culling? Spike during M0.
