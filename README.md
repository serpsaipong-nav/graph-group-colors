# Graph group colors

An Obsidian plugin that renders graph nodes with **multiple colors** when a note matches more than one color group.

Obsidian's core graph view picks a single color per node — the *first* matching color group wins. A note tagged `#databricks` and `#medium` gets one color, not two. This plugin divides the node into colored slices so every matching group is visible.

It is strictly additive: the base node from Obsidian is untouched, slices are drawn on top, and disabling the plugin leaves the graph pixel-identical to stock.

## What it does

- Draws N colored slices over any node that matches N color groups (N ≥ 2).
- Picks the order of groups from your `.obsidian/graph.json` — the same order Obsidian uses.
- Supports the global graph and local graph views.
- Zero changes to Obsidian's files. Read-only access to the renderer. One patch point.

## What it does not do

- It does not replace the core graph view. Nodes with 0 or 1 matching groups stay exactly as stock Obsidian renders them.
- It does not change link colors, layout, or physics.
- It does not re-implement search — it uses the `query` strings in your existing color groups.
- Mobile is not supported in v1.

## Install

### From the community plugin market (once approved)

Settings → Community plugins → Browse → search for *Graph group colors* → Install → Enable.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/serpsaipong-nav/graph-group-colors/releases).
2. Copy them into `<your-vault>/.obsidian/plugins/graph-group-colors/`.
3. Settings → Community plugins → enable *Graph group colors*.

### With BRAT (pre-release)

Add `serpsaipong-nav/graph-group-colors` as a beta plugin in the BRAT plugin.

## Usage

Open the graph view. Any note matching 2+ of your color groups will show one colored arc per group. Hover, pan, zoom, and force simulation all work unchanged.

### Settings

Settings → Graph group colors:

- **Apply overlays to** — *Both* / *Global graph only* / *Local graph only*.
- **Debug multi-color stats** — logs every 5s how many visible nodes matched 2+ groups. Useful for verifying your group queries.

### Commands

All available in the command palette (⌘P / Ctrl+P):

- `Toggle multi-color overlays: Global graph`
- `Toggle multi-color overlays: Local graph`
- `Cycle overlay scope (Both → Global only → Local only)`

Bind any of these to a hotkey in Settings → Hotkeys.

## Color groups

Color groups are defined in Obsidian's own graph settings (Graph view → ⚙️ → Groups). This plugin reads them from `.obsidian/graph.json`. Changes to groups are picked up automatically.

Supported query forms inside a group:

- `tag:#mytag` — matches any note with that tag, including nested (`#mytag/sub`).
- `tag:#a OR tag:#b` — union.
- `tag:#a tag:#b` — intersection (AND).
- `-tag:#x` — negation.
- `path:some/folder` / `file:name`.

> Note: Obsidian 1.12+ rejects `tag:(...)` grouping syntax. Use `tag:#a OR tag:#b` instead of `tag:(#a OR #b)` — the former matches both the stock renderer and this plugin, the latter matches neither.

## How it works

One patch point: the plugin hooks `renderer.renderCallback` on each open graph view. On every frame it reads node positions from the renderer (never writes), resolves each node's matching groups via its own tag-based resolver, and draws colored arcs into a pooled `PIXI.Graphics` container. Unload restores the original callback and detaches the container — nothing is left behind.

Nodes with 0 or 1 matching groups cost nothing — the per-node hot path early-returns.

## Development

```bash
npm install
npm run dev         # esbuild watch → main.js
npm run build       # production build
npm test            # vitest (pure logic)
npm run test:perf   # perf harness against a synthetic 5k-node vault
```

Drop `main.js`, `manifest.json`, and `styles.css` into a test vault's `.obsidian/plugins/graph-group-colors/` directory. The [Hot Reload](https://github.com/pjeby/hot-reload) community plugin will re-load the plugin on rebuild.

## Compatibility

- Requires Obsidian **1.12.7** or later (see `manifest.json`).
- Desktop only.
- Compatible with Sync Graph Settings — this plugin only reads `graph.json`.

## License

TBD — a license file will be added before publishing to the community plugin market.
