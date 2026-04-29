import type { PixiContainerLike, PixiGraphicsLike } from "../graph/NodeOverlay";

export interface GraphNodeInternal {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Obsidian sets this on graph nodes: "file" | "tag" | "attachment" | "unresolved". */
  type?: string;
}

export interface PixiGraphicsInternal {
  destroy(): void;
}

export interface PixiContainerInternal {
  addChild(child: unknown): void;
  removeChild(child: unknown): void;
}

/** Mount container for overlay graphics (PIXI.Container from Obsidian's global PIXI). */
export interface PixiOverlayMountLike extends PixiContainerLike {
  destroy(options?: { children?: boolean }): void;
}

export interface PixiAppInternal {
  stage: PixiContainerInternal;
}

export interface RendererInternal {
  renderCallback: (...args: unknown[]) => void;
  nodes: GraphNodeInternal[];
  px: PixiAppInternal;
}

export interface GraphViewInternal {
  renderer: RendererInternal;
  getViewType?: () => string;
}

type InternalRendererCandidate = {
  renderCallback?: unknown;
  nodes?: unknown;
  px?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasRendererShape(candidate: unknown): candidate is RendererInternal {
  const renderer = candidate as InternalRendererCandidate;
  return (
    typeof renderer?.renderCallback === "function" &&
    Array.isArray(renderer?.nodes) &&
    isObject(renderer?.px) &&
    isObject((renderer.px as { stage?: unknown }).stage)
  );
}

export function getRendererFromView(view: unknown): RendererInternal | null {
  if (!isObject(view)) {
    return null;
  }
  const renderer = (view as { renderer?: unknown }).renderer;
  if (!hasRendererShape(renderer)) {
    return null;
  }
  return renderer;
}

/** Diagnostic: describe why a view failed the renderer shape check (dev console only). */
export function describeRendererShape(view: unknown): string {
  if (!isObject(view)) {
    return `view is not an object (${typeof view})`;
  }
  const r = (view as { renderer?: unknown }).renderer;
  if (r === undefined) {
    return `view.renderer is undefined; view keys: [${Object.keys(view).join(", ")}]`;
  }
  if (!isObject(r)) {
    return `view.renderer is not an object (${typeof r})`;
  }
  const cand = r as InternalRendererCandidate;
  const missing: string[] = [];
  if (typeof cand.renderCallback !== "function") missing.push("renderCallback");
  if (!Array.isArray(cand.nodes)) missing.push("nodes[]");
  if (!isObject(cand.px)) missing.push("px");
  else if (!isObject((cand.px as { stage?: unknown }).stage)) missing.push("px.stage");
  const keys = Object.keys(r).slice(0, 20).join(", ");
  return `renderer missing [${missing.join(", ")}]; keys: [${keys}]`;
}

export function isGraphLikeView(view: unknown): view is GraphViewInternal {
  if (!isObject(view)) {
    return false;
  }
  const getViewType = (view as { getViewType?: unknown }).getViewType;
  if (typeof getViewType !== "function") {
    return false;
  }
  let viewType: unknown;
  try {
    viewType = (getViewType as () => unknown).call(view);
  } catch {
    // Deferred view (Obsidian 1.7+) or otherwise not ready — treat as non-graph.
    return false;
  }
  return viewType === "graph" || viewType === "localgraph";
}

function isPixiGraphicsLike(value: unknown): value is PixiGraphicsLike {
  if (!isObject(value)) {
    return false;
  }
  const g = value as Record<string, unknown>;
  const hasLegacyFill =
    typeof g.beginFill === "function" && typeof g.endFill === "function";
  const hasV8Fill = typeof g.fill === "function";
  if (!hasLegacyFill && !hasV8Fill) {
    return false;
  }
  return (
    typeof g.clear === "function" &&
    typeof g.moveTo === "function" &&
    typeof g.arc === "function" &&
    typeof g.lineTo === "function" &&
    typeof g.destroy === "function" &&
    typeof (g as { x: unknown }).x === "number" &&
    typeof (g as { y: unknown }).y === "number"
  );
}

/**
 * Reuse the global PIXI instance Obsidian loads for graph view (do not bundle PIXI).
 */
export function tryCreateGlobalPixiGraphics(): PixiGraphicsLike | null {
  const root = globalThis as unknown as Record<string, unknown>;
  const pixi = root.PIXI;
  if (!isObject(pixi)) {
    return null;
  }
  const Graphics = pixi.Graphics;
  if (typeof Graphics !== "function") {
    return null;
  }
  const created = new (Graphics as new () => unknown)();
  if (!isPixiGraphicsLike(created)) {
    return null;
  }
  return created;
}

function isPixiOverlayMountLike(value: unknown): value is PixiOverlayMountLike {
  if (!isObject(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return (
    typeof o.addChild === "function" &&
    typeof o.removeChild === "function" &&
    typeof o.destroy === "function"
  );
}

/**
 * Create a PIXI.Container for overlay graphics (Obsidian already loads PIXI).
 */
export function tryCreateGlobalPixiOverlayMount(): PixiOverlayMountLike | null {
  const root = globalThis as unknown as Record<string, unknown>;
  const pixi = root.PIXI;
  if (!isObject(pixi)) {
    return null;
  }
  const Container = pixi.Container;
  if (typeof Container !== "function") {
    return null;
  }
  const created = new (Container as new () => unknown)();
  if (!isPixiOverlayMountLike(created)) {
    return null;
  }
  return created;
}

/**
 * Move `child` to the end of `parent`'s display list so it renders on top (PIXI child order).
 */
export function ensurePixiDisplayObjectIsOnTop(parent: unknown, child: unknown): void {
  if (!isObject(parent) || !isObject(child)) {
    return;
  }
  const p = parent as Record<string, unknown>;
  const children = p.children;
  if (!Array.isArray(children) || children.length < 2) {
    return;
  }
  if (children[children.length - 1] === child) {
    return;
  }
  const removeChild = p.removeChild;
  const addChild = p.addChild;
  if (typeof removeChild !== "function" || typeof addChild !== "function") {
    return;
  }
  (removeChild as (c: unknown) => void).call(parent, child);
  (addChild as (c: unknown) => void).call(parent, child);
}

/**
 * Detach `child` from whatever PIXI container currently holds it (stage or graph world).
 */
export function tryDetachOverlayChildFromParent(parent: unknown, child: unknown): void {
  if (!isObject(parent) || !isObject(child)) {
    return;
  }
  const removeChild = (parent as Record<string, unknown>).removeChild;
  if (typeof removeChild !== "function") {
    return;
  }
  try {
    (removeChild as (c: unknown) => void).call(parent, child);
  } catch {
    // Child may already be detached (e.g. double cleanup).
  }
}

/** @deprecated Use {@link tryDetachOverlayChildFromParent} — same behavior with clearer name. */
export function tryDetachOverlayMountFromStage(stage: unknown, mount: unknown): void {
  tryDetachOverlayChildFromParent(stage, mount);
}

function isPixiLikeContainer(value: unknown): value is PixiContainerInternal {
  if (!isObject(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return (
    typeof o.addChild === "function" &&
    typeof o.removeChild === "function" &&
    Array.isArray(o.children)
  );
}

function tryReadDisplayParentFromGraphNode(node: unknown): unknown | null {
  if (!isObject(node)) {
    return null;
  }
  const n = node as Record<string, unknown>;
  const candidates = [n.circle, n.sprite, n.obj, n.g, n.graphic, n.displayObject, n.node, n.graphics];
  for (const c of candidates) {
    if (!isObject(c)) {
      continue;
    }
    const child = c as Record<string, unknown>;
    const parent = child.parent;
    if (isPixiLikeContainer(parent)) {
      return parent;
    }
  }
  return null;
}

function tryReadOverlayParentFromRendererRecord(renderer: RendererInternal): unknown | null {
  const r = renderer as unknown as Record<string, unknown>;
  const keys = [
    "hanger",
    "world",
    "nodesLayer",
    "nodeLayer",
    "nodeContainer",
    "graphContainer",
    "root",
    "layer",
    "graph"
  ];
  for (const k of keys) {
    const v = r[k];
    if (isPixiLikeContainer(v)) {
      return v;
    }
  }
  return null;
}

/**
 * Obsidian 1.12+ dropped `node.r`; derive effective radius from `node.circle.width/2`
 * (bounding box of the PIXI display object). Returns null if nothing usable is present.
 */
export function readNodeRadius(node: unknown): number | null {
  if (!isObject(node)) return null;
  const n = node as Record<string, unknown>;
  if (typeof n.r === "number" && Number.isFinite(n.r) && n.r > 0) {
    return n.r;
  }
  const circle = n.circle;
  if (isObject(circle)) {
    const c = circle as Record<string, unknown>;
    if (typeof c.width === "number" && Number.isFinite(c.width) && c.width > 0) {
      return c.width / 2;
    }
    const scale = c.scale as { x?: unknown } | undefined;
    if (scale && typeof scale.x === "number" && Number.isFinite(scale.x) && scale.x > 0) {
      return scale.x * 8;
    }
  }
  return null;
}

/**
 * Screen-space transform used by Obsidian's graph renderer: world → screen is
 * `screenX = x * scale + panX`, `screenY = y * scale + panY`. Returns null when
 * the fields are missing / non-finite (fall back: skip the frame, not wrong-positioned draw).
 */
export function readRendererScreenTransform(
  renderer: RendererInternal
): { panX: number; panY: number; scale: number } | null {
  const r = renderer as unknown as Record<string, unknown>;
  const panX = r.panX;
  const panY = r.panY;
  const scale = r.scale;
  if (
    typeof panX !== "number" ||
    typeof panY !== "number" ||
    typeof scale !== "number" ||
    !Number.isFinite(panX) ||
    !Number.isFinite(panY) ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return null;
  }
  return { panX, panY, scale };
}

/**
 * Compute where to draw the overlay so it lands on the visible graph node circle, expressed
 * in `targetContainer`'s local coordinate space.
 *
 * Why the two-step global → local dance: in Obsidian 1.12+ the node `circle`/sprite is often
 * nested inside per-node or per-layer containers, so `circle.x/y` are local coords in some
 * intermediate container — not in our overlay mount. Using them directly either floats overlays
 * off-node or collapses them to the world origin (hanger center). `circle.getGlobalPosition()`
 * flattens the entire transform chain to screen coordinates; `targetContainer.toLocal(...)`
 * reprojects those back into our mount's space. This works regardless of where the circle lives.
 *
 * Returns null if PIXI shape is unexpected; caller should skip drawing for that node.
 */
function pickNodeDisplayObject(node: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [node.circle, node.sprite, node.obj, node.g, node.graphic, node.displayObject, node.graphics];
  for (const c of candidates) {
    if (isObject(c)) {
      return c as Record<string, unknown>;
    }
  }
  return null;
}

export function readNodeWorldPosition(
  node: unknown,
  targetContainer: unknown
): { x: number; y: number } | null {
  if (!isObject(node) || !isObject(targetContainer)) return null;
  const display = pickNodeDisplayObject(node as Record<string, unknown>);
  if (!display) {
    return readNodeSimulationPosition(node);
  }

  const getGlobalPosition = display.getGlobalPosition;
  const toLocal = (targetContainer as Record<string, unknown>).toLocal;
  if (typeof getGlobalPosition === "function" && typeof toLocal === "function") {
    let global: unknown;
    try {
      global = (getGlobalPosition as () => unknown).call(display);
    } catch {
      return readNodeSimulationPosition(node);
    }
    if (isObject(global)) {
      const g = global as Record<string, unknown>;
      if (typeof g.x === "number" && typeof g.y === "number" && Number.isFinite(g.x) && Number.isFinite(g.y)) {
        let local: unknown;
        try {
          local = (toLocal as (point: unknown) => unknown).call(targetContainer, { x: g.x, y: g.y });
        } catch {
          return readNodeSimulationPosition(node);
        }
        if (isObject(local)) {
          const l = local as Record<string, unknown>;
          if (typeof l.x === "number" && typeof l.y === "number" && Number.isFinite(l.x) && Number.isFinite(l.y)) {
            return { x: l.x, y: l.y };
          }
        }
      }
    }
  }

  return readNodeSimulationPosition(node);
}

function readNodeSimulationPosition(node: unknown): { x: number; y: number } | null {
  if (!isObject(node)) return null;
  const n = node as Record<string, unknown>;
  if (typeof n.x === "number" && typeof n.y === "number" && Number.isFinite(n.x) && Number.isFinite(n.y)) {
    return { x: n.x, y: n.y };
  }
  return null;
}

/**
 * Pick the PIXI parent for overlay mount so `node.x` / `node.y` match stock graph coordinates.
 * Obsidian keeps node positions in a nested "world" container; `stage` alone is a fallback.
 *
 * Discovery order (shape-checked, fail-safe): node display object parent → renderer record fields → stage.
 *
 * When upgrading Obsidian, verify in DevTools (Graph view open): inspect `renderer.nodes[i]` for a
 * PIXI display field (`circle`, `sprite`, …) and confirm `field.parent` is the same container that
 * holds node sprites; if names change, extend {@link tryReadDisplayParentFromGraphNode} /
 * {@link tryReadOverlayParentFromRendererRecord} only here.
 */
export function tryResolveGraphOverlayParent(
  renderer: RendererInternal,
  sampleNode: unknown
): { parent: unknown; usedStageFallback: boolean } {
  const stage = renderer.px.stage;
  const fromNode = tryReadDisplayParentFromGraphNode(sampleNode);
  if (fromNode && fromNode !== stage && isPixiLikeContainer(fromNode)) {
    return { parent: fromNode, usedStageFallback: false };
  }
  const fromRenderer = tryReadOverlayParentFromRendererRecord(renderer);
  if (fromRenderer && fromRenderer !== stage && isPixiLikeContainer(fromRenderer)) {
    return { parent: fromRenderer, usedStageFallback: false };
  }
  return { parent: stage, usedStageFallback: true };
}

export function readGlobalPixiMajorVersion(): number | null {
  const root = globalThis as unknown as Record<string, unknown>;
  const pixi = root.PIXI;
  if (!isObject(pixi)) {
    return null;
  }
  const v = (pixi as { VERSION?: unknown }).VERSION;
  if (typeof v !== "string") {
    return null;
  }
  const major = Number.parseInt(v.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

/**
 * Pixi v8 prefers `fill()` after path primitives; older Pixi uses `beginFill` / `endFill`.
 * Uses `PIXI.VERSION` when present; otherwise infers from a throwaway `Graphics` instance
 * (fill-only API ⇒ v8) so embedded/custom PIXI builds still pick a working path.
 */
export function probeGlobalPixiGraphicsDrawMode(): "legacy" | "v8" {
  const major = readGlobalPixiMajorVersion();
  if (major !== null && major >= 8) {
    return "v8";
  }
  if (major !== null && major < 8) {
    return "legacy";
  }
  const g = tryCreateGlobalPixiGraphics();
  if (!g) {
    return "legacy";
  }
  const rec = g as unknown as Record<string, unknown>;
  const hasFill = typeof rec.fill === "function";
  const hasBegin = typeof rec.beginFill === "function";
  try {
    g.destroy();
  } catch {
    // Ignore teardown issues on exotic PIXI builds.
  }
  if (hasFill && !hasBegin) {
    return "v8";
  }
  return "legacy";
}

/**
 * Best-effort read of whether the graph force simulation is still "hot" (for throttling).
 * If shape is unknown, returns false (draw every frame).
 */
export function readSimulationActiveFromRenderer(renderer: RendererInternal): boolean {
  const record = renderer as unknown as Record<string, unknown>;
  const candidates = [record.simulation, record.forceSimulation, record.sim];
  for (const sim of candidates) {
    if (!isObject(sim)) {
      continue;
    }
    const alpha = sim.alpha;
    if (typeof alpha === "number") {
      return alpha > 0.04;
    }
    const running = sim.running;
    if (typeof running === "boolean") {
      return running;
    }
  }
  return false;
}
