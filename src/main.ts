import { ColorCache } from "./graph/ColorCache";
import { tryAttachGraphView, type HookHandle } from "./graph/GraphViewHook";
import { GroupResolver, type GraphConfig, type GroupColorMatch } from "./graph/GroupResolver";
import {
  NodeOverlay,
  type GroupColor,
  type PixiGraphicsDrawMode,
  type PixiGraphicsLike
} from "./graph/NodeOverlay";
import { OverlayCap } from "./graph/perf/OverlayCap";
import { FrameThrottle } from "./graph/perf/Throttle";
import { isNodeVisibleInViewport, viewportFromTransform, type ViewportBounds } from "./graph/perf/ViewportCull";
import {
  describeRendererShape,
  getRendererFromView,
  isGraphLikeView,
  probeGlobalPixiGraphicsDrawMode,
  readNodeRadius,
  readRendererScreenTransform,
  tryCreateGlobalPixiOverlayMount,
  tryDetachOverlayChildFromParent,
  type PixiOverlayMountLike,
  type RendererInternal
} from "./utils/obsidianInternals";
import { preNormalizeGraphNodeId } from "./utils/graphNodePath";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type MultiColorSettings,
  type PartialMultiColorSettings
} from "./settings/settings";

export interface RuntimeLogger {
  warn(message: string, error?: unknown): void;
}

export interface RuntimeDeps {
  logger: RuntimeLogger;
  createGraphics(): PixiGraphicsLike;
  /**
   * Map graph `node.id` to the vault path used by `getAbstractFileByPath` / metadata cache.
   * When omitted, only {@link preNormalizeGraphNodeId} runs (tests / headless harness).
   */
  normalizeNodePath?(id: string): string;
  /**
   * Test / perf harness only. Production uses `PIXI.Container` from Obsidian.
   */
  createOverlayMount?(): PixiOverlayMountLike;
  /** Override Pixi draw pipeline (tests). */
  getPixiGraphicsDrawMode?(): PixiGraphicsDrawMode;
  getNodeTags(path: string): readonly string[];
  getAllGraphViews(): readonly unknown[];
  getViewportBounds?(renderer: RendererInternal): ViewportBounds | null;
  isSimulationActive?(renderer: RendererInternal): boolean;
}

interface ViewState {
  handle: HookHandle;
  overlay: NodeOverlay;
  overlayMount: PixiOverlayMountLike;
  /** Current PIXI parent of `overlayMount` — always stage; kept for safe teardown. */
  mountParent: { current: unknown };
  /** Kept so {@link MCGNRuntime.forceRenderAttachedViews} can trigger a redraw when Obsidian's simulation is settled. */
  renderer: RendererInternal;
}

export class MCGNRuntime {
  private readonly resolver = new GroupResolver({ maxColorsPerNode: DEFAULT_SETTINGS.maxColorsPerNode });
  private readonly cache = new ColorCache();
  private readonly viewStateByView = new Map<unknown, ViewState>();
  private readonly throttle = new FrameThrottle({ enabled: false, interval: 2 });
  private readonly overlayCap = new OverlayCap({ enabled: false, maxVisibleNodes: 2000 });
  private readonly graphicsDrawMode: PixiGraphicsDrawMode;
  private settings = DEFAULT_SETTINGS;
  private lastDebugLogMs = 0;

  constructor(private readonly deps: RuntimeDeps) {
    this.graphicsDrawMode = this.deps.getPixiGraphicsDrawMode?.() ?? probeGlobalPixiGraphicsDrawMode();
  }

  private defaultNormalizeNodePath(id: string): string {
    return preNormalizeGraphNodeId(id);
  }

  private resolveNodePath(id: string): string {
    return this.deps.normalizeNodePath?.(id) ?? this.defaultNormalizeNodePath(id);
  }

  setSettings(nextSettings: PartialMultiColorSettings): void {
    this.settings = normalizeSettings({
      ...this.settings,
      ...nextSettings,
      perf: {
        ...this.settings.perf,
        ...nextSettings.perf
      }
    });
    this.resolver.setMaxColorsPerNode(this.settings.maxColorsPerNode);
    this.throttle.configure({
      enabled: this.settings.perf.throttleEnabled,
      interval: this.settings.perf.throttleInterval
    });
    this.overlayCap.configure({
      enabled: this.settings.perf.overlayCapEnabled,
      maxVisibleNodes: this.settings.perf.maxVisibleNodes
    });

    for (const [, state] of this.viewStateByView.entries()) {
      if (!state.overlay.isDestroyed()) {
        state.overlay.setMaxColorsPerNode(this.settings.maxColorsPerNode);
      }
      if (this.settings.killSwitch) {
        state.overlay.destroy();
      }
    }
  }

  loadGraphConfig(config: GraphConfig): void {
    this.resolver.loadGroups(config);
    this.cache.clear();
  }

  attachToOpenViews(): void {
    for (const view of this.deps.getAllGraphViews()) {
      this.attachView(view);
    }
  }

  attachView(view: unknown): void {
    if (this.viewStateByView.has(view)) {
      return;
    }
    if (!isGraphLikeView(view) || !this.isEnabledForView(view)) {
      return;
    }
    const renderer = getRendererFromView(view);
    if (!renderer) {
      this.deps.logger.warn(
        `[MCGN] Unexpected graph renderer shape, skipping hook. ${describeRendererShape(view)}`
      );
      return;
    }

    const overlayMount =
      this.deps.createOverlayMount?.() ?? tryCreateGlobalPixiOverlayMount();
    if (!overlayMount) {
      this.deps.logger.warn("[MCGN] PIXI.Container not available; skipping graph attach.");
      return;
    }
    renderer.px.stage.addChild(overlayMount);

    const mountParent = { current: renderer.px.stage as unknown };
    const overlay = new NodeOverlay(overlayMount, () => this.deps.createGraphics(), {
      maxColorsPerNode: this.settings.maxColorsPerNode,
      graphicsDrawMode: this.graphicsDrawMode
    });

    const state: ViewState = {
      handle: null as unknown as HookHandle,
      overlay,
      overlayMount,
      mountParent,
      renderer
    };

    const handle = tryAttachGraphView(
      view,
      () => this.renderFrame(renderer, state),
      this.deps.logger
    );
    if (!handle) {
      overlay.destroy();
      this.safeTeardownOverlayMount(mountParent, overlayMount);
      return;
    }
    state.handle = handle;

    this.viewStateByView.set(view, state);
  }

  detachView(view: unknown): void {
    const state = this.viewStateByView.get(view);
    if (!state) {
      return;
    }
    try {
      state.handle.detach();
    } finally {
      state.overlay.destroy();
      this.safeTeardownOverlayMount(state.mountParent, state.overlayMount);
      this.viewStateByView.delete(view);
    }
  }

  detachMissingViews(currentViews: readonly unknown[]): void {
    const currentSet = new Set(currentViews);
    for (const view of this.viewStateByView.keys()) {
      if (!currentSet.has(view)) {
        this.detachView(view);
      }
    }
  }

  refreshAttachedViews(): void {
    const openViews = this.deps.getAllGraphViews();
    this.detachMissingViews(openViews);
    for (const view of openViews) {
      if (this.viewStateByView.has(view) && !this.isEnabledForView(view)) {
        this.detachView(view);
        continue;
      }
      this.attachView(view);
    }
  }

  /**
   * Redraw overlays for every attached view without touching Obsidian's renderCallback.
   * Invoking the patched callback would be a no-op on a settled simulation (the original does
   * nothing, our overlay loop then reads stale state) and risks re-entering Obsidian's draw
   * mid-batch. Running the overlay-draw loop out-of-band reuses the same error boundary logic
   * by letting a caught error warn-and-continue, so a bad view can't take the graph down.
   */
  forceRenderAttachedViews(): void {
    for (const [, state] of this.viewStateByView.entries()) {
      try {
        this.renderFrame(state.renderer, state);
      } catch (error) {
        this.deps.logger.warn("[MCGN] Forced redraw failed; will recover on next frame.", error);
      }
    }
  }

  onMetadataChanged(path: string): void {
    this.cache.invalidatePath(path);
  }

  onFileRename(oldPath: string, newPath: string): void {
    this.cache.handleRename(oldPath, newPath);
  }

  onFileDelete(path: string): void {
    this.cache.invalidatePath(path);
  }

  onFileCreate(path: string): void {
    this.cache.invalidatePath(path);
  }

  destroy(): void {
    for (const view of Array.from(this.viewStateByView.keys())) {
      this.detachView(view);
    }
  }

  getAttachedViewCount(): number {
    return this.viewStateByView.size;
  }

  private renderFrame(renderer: RendererInternal, state: ViewState): void {
    const { overlay } = state;
    if (this.settings.killSwitch) {
      overlay.destroy();
      return;
    }

    const nodes = renderer.nodes;
    if (!this.overlayCap.canRenderOverlays(nodes.length)) {
      overlay.destroy();
      return;
    }

    const simulationActive = this.deps.isSimulationActive?.(renderer) ?? false;
    if (!this.throttle.shouldDraw(simulationActive)) {
      return;
    }

    const transform = readRendererScreenTransform(renderer);
    if (!transform) {
      return;
    }
    const { panX, panY, scale } = transform;

    const viewport = this.settings.perf.cullOutsideViewport
      ? this.resolveViewportBounds(renderer)
      : null;
    // Tracks every node still owned by the renderer this frame, regardless of viewport culling.
    // Drives the post-loop GC so overlays for nodes that LEFT `renderer.nodes` (e.g. local-graph
    // note switch) get dropped instead of lingering as ghost circles. Off-screen-but-still-present
    // nodes must remain in the set, otherwise their overlays would be destroyed and recreated on
    // every pan.
    const activePaths = new Set<string>();
    for (const node of nodes) {
      // resolveNodePath returns '#tag' for vault tag nodes (signalled by normalizeNodePath dep).
      // Also catch the case where Obsidian itself prefixes tag node ids with '#'.
      const filePath = this.resolveNodePath(node.id);
      const isTagNode = filePath.startsWith("#") || node.type === "tag";
      activePaths.add(filePath);
      if (viewport && !isNodeVisibleInViewport(node, viewport)) {
        continue;
      }
      if (isTagNode && !this.settings.enableTagNodeColors) {
        overlay.clear(filePath);
        continue;
      }
      const colors = isTagNode ? this.getTagNodeColors(filePath) : this.getNodeColors(filePath);
      // File nodes: Obsidian already handles single-group color, only overlay for 2+ groups.
      // Tag nodes: Obsidian does not apply color groups to tag nodes themselves, so overlay
      // even for a single match so the tag node shows its group color.
      const minColors = isTagNode ? 1 : 2;
      if (colors.length < minColors) {
        overlay.clear(filePath);
        continue;
      }
      const radius = readNodeRadius(node);
      if (radius === null || radius <= 0) {
        continue;
      }
      const screenX = node.x * scale + panX;
      const screenY = node.y * scale + panY;
      const screenR = radius * scale;
      overlay.draw({ ...node, id: filePath, r: screenR, x: screenX, y: screenY }, colors);
    }
    overlay.clearMissing(activePaths);

    if (this.settings.perf.debugLogMultiColorStats) {
      this.maybeLogMultiColorStats(nodes, viewport);
    }
  }

  private maybeLogMultiColorStats(
    nodes: RendererInternal["nodes"],
    viewport: ViewportBounds | null
  ): void {
    const now = Date.now();
    if (now - this.lastDebugLogMs < 5000) {
      return;
    }
    this.lastDebugLogMs = now;
    let multi = 0;
    let visible = 0;
    for (const node of nodes) {
      if (viewport && !isNodeVisibleInViewport(node, viewport)) {
        continue;
      }
      visible += 1;
      const filePath = this.resolveNodePath(node.id);
      const colors = this.getNodeColors(filePath);
      if (colors.length > 1) {
        multi += 1;
      }
    }
    console.info(
      `[MCGN] multi-color nodes (2+ groups): ${multi} / visible ${visible} / total ${nodes.length}`
    );
  }

  private safeTeardownOverlayMount(
    mountParent: { current: unknown },
    mount: PixiOverlayMountLike
  ): void {
    // Detach from PIXI stage only. Do NOT call `mount.destroy()` — calling it mid-render
    // can tear down GL resources Obsidian's renderer is still batching, which leaves the
    // stage in a bad state (stock graph-group colors stop updating). Detaching is enough;
    // the Container is a plain JS object that GC will claim once references drop.
    tryDetachOverlayChildFromParent(mountParent.current, mount);
  }

  resolveTagColors(tagId: string): GroupColor[] {
    return this.getTagNodeColors(tagId);
  }

  private getTagNodeColors(tagId: string): GroupColor[] {
    const cached = this.cache.get(tagId);
    if (cached) {
      return this.toOverlayColors(cached);
    }
    const resolved = this.resolver.resolveForTag(tagId);
    this.cache.set(tagId, resolved);
    return this.toOverlayColors(resolved);
  }

  private getNodeColors(path: string): GroupColor[] {
    const cached = this.cache.get(path);
    if (cached) {
      return this.toOverlayColors(cached);
    }
    const tags = this.deps.getNodeTags(path);
    const resolved = this.resolver.resolveForFile(path, tags);
    this.cache.set(path, resolved);
    return this.toOverlayColors(resolved);
  }

  private toOverlayColors(matches: readonly GroupColorMatch[]): GroupColor[] {
    const colors: GroupColor[] = [];
    for (const match of matches) {
      colors.push({ rgb: match.rgb, alpha: match.alpha });
    }
    return colors;
  }

  private resolveViewportBounds(renderer: RendererInternal): ViewportBounds | null {
    if (this.deps.getViewportBounds) {
      return this.deps.getViewportBounds(renderer);
    }
    const transformed = renderer as RendererInternal & {
      panX?: number;
      panY?: number;
      scale?: number;
      width?: number;
      height?: number;
    };
    if (
      typeof transformed.panX !== "number" ||
      typeof transformed.panY !== "number" ||
      typeof transformed.scale !== "number" ||
      typeof transformed.width !== "number" ||
      typeof transformed.height !== "number"
    ) {
      return null;
    }
    return viewportFromTransform(transformed.width, transformed.height, {
      panX: transformed.panX,
      panY: transformed.panY,
      scale: transformed.scale
    });
  }

  private isEnabledForView(view: unknown): boolean {
    const fn = (view as { getViewType?: unknown }).getViewType;
    if (typeof fn !== "function") {
      return false;
    }
    let viewType: unknown;
    try {
      viewType = (fn as () => unknown).call(view);
    } catch {
      return false;
    }
    if (viewType === "graph") {
      return this.settings.enableGlobalGraph;
    }
    if (viewType === "localgraph") {
      return this.settings.enableLocalGraph;
    }
    return false;
  }
}
