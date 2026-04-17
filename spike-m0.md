# M0 Spike — Saturday morning

**Goal:** in one afternoon, confirm you can hook the graph renderer, draw on top of nodes, and cleanly unhook. Everything else in the project depends on this working.

**Time budget:** 3 hours. If you're still fighting it at the 3-hour mark, stop and reassess — the project is harder than planned.

**Success criteria:** enable → red squares appear next to every node. Drag a node → square follows. Zoom/pan → square moves with the node. Disable → squares gone, graph works normally. Repeat 10 times → no errors, no leaks.

---

## 0. Prerequisites

- Node ≥ 18 (you already have this for data work).
- A **dev vault** — not your real vault. Create a new empty vault, add maybe 20 notes with a few tags and links. You'll poke at internal APIs and occasionally crash things; don't do that on `second-brain-v2`.
- Obsidian desktop (any recent version).

## 1. Scaffold the plugin (20 min)

```bash
cd ~/dev  # or wherever
git clone https://github.com/obsidianmd/obsidian-sample-plugin multicolor-graph-nodes
cd multicolor-graph-nodes
rm -rf .git
git init
npm install
```

Open `manifest.json`, replace with:

```json
{
  "id": "multicolor-graph-nodes",
  "name": "Multi-Color Graph Nodes",
  "version": "0.0.1",
  "minAppVersion": "1.4.0",
  "description": "Spike: patch the graph renderer.",
  "author": "Pong",
  "isDesktopOnly": true
}
```

## 2. Symlink into your dev vault (5 min)

So `npm run dev` rebuilds and Obsidian can reload without copying files.

```bash
# Replace <DEV_VAULT> with your dev vault path
mkdir -p <DEV_VAULT>/.obsidian/plugins/multicolor-graph-nodes
ln -s "$(pwd)/main.js"       <DEV_VAULT>/.obsidian/plugins/multicolor-graph-nodes/main.js
ln -s "$(pwd)/manifest.json" <DEV_VAULT>/.obsidian/plugins/multicolor-graph-nodes/manifest.json
```

On Windows, use `mklink` or just copy these two files after each build.

Optional but highly recommended: install the `Hot Reload` community plugin in your dev vault. It auto-reloads your plugin whenever `main.js` changes, so you don't have to toggle the plugin manually.

## 3. Replace `main.ts` with the spike code (5 min)

Replace the entire contents of `main.ts` with this:

```ts
import { Plugin, WorkspaceLeaf } from "obsidian";

// We're reaching into undocumented internals. All of that is contained here.
// If Obsidian changes shape, this is the one file to edit.
interface GraphRenderer {
  renderCallback: Function;
  nodes: Array<GraphNode>;
  px: PixiApp;          // PIXI.Application
  panX: number;
  panY: number;
  scale: number;
}

interface GraphNode {
  id: string;           // file path
  x: number;
  y: number;
  circle?: PixiDisplayObject;
}

// We don't import PIXI — we use the instance Obsidian already loaded.
// These types are minimal, just enough to satisfy the spike.
type PixiApp = { stage: PixiContainer };
type PixiContainer = {
  addChild: (c: PixiDisplayObject) => void;
  removeChild: (c: PixiDisplayObject) => void;
};
type PixiDisplayObject = {
  x: number; y: number; destroy: () => void;
};

// Pull PIXI off the global scope — it's loaded by Obsidian itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PIXI: any = (globalThis as any).PIXI;

function hasGraphRendererShape(obj: unknown): obj is GraphRenderer {
  const r = obj as GraphRenderer;
  return !!r
      && typeof r.renderCallback === "function"
      && Array.isArray(r.nodes)
      && !!r.px;
}

export default class MCGNSpike extends Plugin {
  private hooks: Array<() => void> = [];

  async onload() {
    console.log("[MCGN] onload");

    if (!PIXI) {
      console.warn("[MCGN] PIXI not found on globalThis — open graph view first, then enable plugin");
    }

    // Attach to any graph views already open.
    this.app.workspace.iterateAllLeaves((leaf) => this.tryAttach(leaf));

    // Attach when new ones open.
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.app.workspace.iterateAllLeaves((leaf) => this.tryAttach(leaf));
      })
    );
  }

  async onunload() {
    console.log("[MCGN] onunload — running", this.hooks.length, "teardown hooks");
    for (const unhook of this.hooks) {
      try { unhook(); } catch (e) { console.error("[MCGN] teardown error", e); }
    }
    this.hooks = [];
  }

  private tryAttach(leaf: WorkspaceLeaf) {
    const view = leaf.view as unknown as { getViewType?: () => string; renderer?: unknown };
    const type = view.getViewType?.();
    if (type !== "graph" && type !== "localgraph") return;

    const renderer = view.renderer;
    if (!hasGraphRendererShape(renderer)) {
      console.warn("[MCGN] graph view found but renderer shape unexpected — skipping");
      return;
    }

    // Avoid double-attaching to the same renderer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((renderer as any).__mcgnAttached) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (renderer as any).__mcgnAttached = true;

    console.log("[MCGN] attaching to", type);

    const overlayByNodeId = new Map<string, PixiDisplayObject>();
    const original = renderer.renderCallback;
    let errCount = 0;
    const MAX_ERRS = 5;

    const patched = function (this: GraphRenderer, ...args: unknown[]) {
      original.apply(this, args as []);
      try {
        for (const node of this.nodes) {
          let sq = overlayByNodeId.get(node.id);
          if (!sq) {
            sq = new PIXI.Graphics();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sq as any).beginFill(0xff0000, 0.9);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sq as any).drawRect(-4, -4, 8, 8);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sq as any).endFill();
            this.px.stage.addChild(sq!);
            overlayByNodeId.set(node.id, sq!);
          }
          // Node coords are in graph space; stage is already transformed by
          // pan/scale, so using node.x / node.y directly should place squares
          // right on the nodes. If they drift, add +8 to x to offset.
          sq.x = node.x;
          sq.y = node.y;
        }
      } catch (e) {
        errCount++;
        console.error("[MCGN] frame error", e);
        if (errCount >= MAX_ERRS) {
          console.warn("[MCGN] too many errors — detaching for safety");
          renderer.renderCallback = original;
        }
      }
    };

    renderer.renderCallback = patched;

    // Teardown: restore the original, clean up overlays.
    const unhook = () => {
      renderer.renderCallback = original;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (renderer as any).__mcgnAttached;
      for (const sq of overlayByNodeId.values()) {
        try {
          renderer.px.stage.removeChild(sq);
          sq.destroy();
        } catch (e) { console.error("[MCGN] cleanup error", e); }
      }
      overlayByNodeId.clear();
      console.log("[MCGN] detached");
    };
    this.hooks.push(unhook);
  }
}
```

That's it. ~100 lines. All the defensive patterns from the plan are here in miniature: shape check, error boundary, 5-error circuit breaker, clean teardown.

## 4. Build and test (30 min)

```bash
npm run dev   # leave this running in a terminal
```

Then:

1. Open Obsidian on your dev vault.
2. Open DevTools: `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows).
3. Settings → Community Plugins → disable Safe Mode if needed.
4. Enable "Multi-Color Graph Nodes".
5. Open Graph View.

**Expected result:** every node has a small red square drawn on top of it. When you drag a node, the square follows. When you zoom/pan, it tracks. When the force simulation runs, the squares stay on their nodes every frame.

## 5. Things to verify (this is the actual test) (60 min)

Take your time with each. These answer the spike's real questions.

### 5.1 Basic attach works

- [ ] Red squares appear on every node.
- [ ] Console shows `[MCGN] attaching to graph`.
- [ ] No red errors in the console.

### 5.2 Squares track nodes correctly

- [ ] Drag a node — square follows without lag.
- [ ] Zoom in/out — squares stay attached and scale correctly.
- [ ] Pan the view — squares pan with nodes.
- [ ] Force simulation is active (when view first opens) — squares track every frame.

If squares are offset from nodes rather than centered on them, that's a coordinate-space issue — easily fixable. **Not a spike-killer.** Adjust the `sq.x = node.x` line with whatever offset you observe.

### 5.3 Interactions still work

- [ ] Click a node → opens the note.
- [ ] Hover → label shows normally.
- [ ] Link colors, thickness, arrows — unchanged.
- [ ] Local graph — open one, squares appear there too.

### 5.4 Clean detach

- [ ] Disable the plugin — squares disappear.
- [ ] Graph view keeps working normally, no visual glitches.
- [ ] Re-enable — squares come back.
- [ ] Repeat enable/disable 10 times. No errors, no weird drift, no squares piling up.

### 5.5 Crash resilience

Temporarily add `throw new Error("boom")` inside the `try` block (right after `for (const node of this.nodes)`). Rebuild, reload Obsidian.

- [ ] Console shows 5 error messages.
- [ ] Console shows `too many errors — detaching for safety`.
- [ ] Graph view continues to render normally after that point — no crash.

Remove the `throw` before continuing.

### 5.6 Shape-mismatch resilience

In DevTools console, with the plugin disabled, run:

```js
app.workspace.iterateAllLeaves(l => {
  if (l.view?.getViewType?.() === "graph") {
    const r = l.view.renderer;
    r.__originalRenderCallback = r.renderCallback;
    delete r.renderCallback;  // simulate future Obsidian change
  }
});
```

Now enable the plugin. Expected:

- [ ] Console shows `renderer shape unexpected — skipping`.
- [ ] No squares, but graph view keeps working.

Restore it:

```js
app.workspace.iterateAllLeaves(l => {
  if (l.view?.getViewType?.() === "graph") {
    const r = l.view.renderer;
    if (r.__originalRenderCallback) r.renderCallback = r.__originalRenderCallback;
  }
});
```

## 6. What each outcome tells you

After the afternoon, you're in one of four buckets:

**Bucket A — everything works, all checks pass.** Great. The project is 7 weekends of focused work on top of a solid foundation. Move on to M1.

**Bucket B — squares appear but are offset or drift.** Coordinate-space issue. Not a blocker — 30-minute fix. You're still in Bucket A, effectively.

**Bucket C — renderer shape is different from what's assumed.** The node collection might be named differently, or `renderCallback` lives on a different object. Open DevTools, run `app.workspace.getLeavesOfType('graph')[0].view.renderer` and inspect. The fix is to update `hasGraphRendererShape` and the patch target. Adds maybe half a day; still doable.

**Bucket D — you can't get a patch to stick, or the graph crashes, or detach leaks.** This is the real risk case. If you hit this, **stop and reconsider the project.** Read the Extended Graph source for how they solved it — their approach might differ materially. If their approach is complicated enough that you don't want to maintain it, the project honestly isn't worth doing.

## 7. If you get stuck

Two references to check in this order:

1. **Extended Graph source** — https://github.com/ElsaTam/obsidian-extended-graph — look for where they patch the renderer. It's the most recent, most-maintained example.
2. **Graph Link Types source** — https://github.com/natefrisch01/Graph-Link-Types — simpler codebase, easier to read. Works the same way at the renderer level.

Don't read both before starting. Start with the code above, get stuck, then read whichever source you need.

## 8. After the spike

If you're in Bucket A or B, commit the spike as `spike/m0-renderer-patch`, then throw the code away and start M1 clean with the real architecture from `plan.md`. The spike is a learning artifact, not code you keep.

If you're in Bucket C, do the same but note the shape-check changes you needed.

If you're in Bucket D, write up what you learned, keep the docs for future-you or someone else, and go spend the weekend on Novarn instead.
