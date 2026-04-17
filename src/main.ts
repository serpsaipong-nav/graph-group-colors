import { ColorCache } from "./graph/ColorCache";
import { tryAttachGraphView, type HookHandle } from "./graph/GraphViewHook";
import { GroupResolver, type GraphConfig, type GroupColorMatch } from "./graph/GroupResolver";
import { NodeOverlay, type GroupColor, type PixiGraphicsLike } from "./graph/NodeOverlay";
import { OverlayCap } from "./graph/perf/OverlayCap";
import { FrameThrottle } from "./graph/perf/Throttle";
import { isNodeVisibleInViewport, viewportFromTransform, type ViewportBounds } from "./graph/perf/ViewportCull";
import { getRendererFromView, isGraphLikeView, type RendererInternal } from "./utils/obsidianInternals";
import { DEFAULT_SETTINGS, normalizeSettings, type MultiColorSettings } from "./settings/settings";

export interface RuntimeLogger {
  warn(message: string, error?: unknown): void;
}

export interface RuntimeDeps {
  logger: RuntimeLogger;
  createGraphics(): PixiGraphicsLike;
  getNodeTags(path: string): readonly string[];
  getAllGraphViews(): readonly unknown[];
  getViewportBounds?(renderer: RendererInternal): ViewportBounds | null;
  isSimulationActive?(renderer: RendererInternal): boolean;
}

interface ViewState {
  handle: HookHandle;
  overlay: NodeOverlay;
}

export class MCGNRuntime {
  private readonly resolver = new GroupResolver({ maxColorsPerNode: DEFAULT_SETTINGS.maxColorsPerNode });
  private readonly cache = new ColorCache();
  private readonly viewStateByView = new Map<unknown, ViewState>();
  private readonly throttle = new FrameThrottle({ enabled: false, interval: 2 });
  private readonly overlayCap = new OverlayCap({ enabled: false, maxVisibleNodes: 2000 });
  private settings = DEFAULT_SETTINGS;

  constructor(private readonly deps: RuntimeDeps) {}

  setSettings(nextSettings: Partial<MultiColorSettings>): void {
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

    for (const state of this.viewStateByView.values()) {
      state.overlay.setMaxColorsPerNode(this.settings.maxColorsPerNode);
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
      this.deps.logger.warn("[MCGN] Unexpected graph renderer shape, skipping hook.");
      return;
    }

    const overlay = new NodeOverlay(renderer.px.stage, () => this.deps.createGraphics(), {
      maxColorsPerNode: this.settings.maxColorsPerNode
    });

    const handle = tryAttachGraphView(
      view,
      () => this.renderFrame(renderer, overlay),
      this.deps.logger
    );
    if (!handle) {
      overlay.destroy();
      return;
    }

    this.viewStateByView.set(view, { handle, overlay });
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
      this.attachView(view);
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

  private renderFrame(renderer: RendererInternal, overlay: NodeOverlay): void {
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

    const viewport = this.settings.perf.cullOutsideViewport
      ? this.resolveViewportBounds(renderer)
      : null;
    for (const node of nodes) {
      if (viewport && !isNodeVisibleInViewport(node, viewport)) {
        continue;
      }
      const colors = this.getNodeColors(node.id);
      if (colors.length <= 1) {
        overlay.clear(node.id);
        continue;
      }
      overlay.draw(node, colors);
    }
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
    const getViewType = (view as { getViewType?: () => string }).getViewType;
    const viewType = getViewType?.();
    if (viewType === "graph") {
      return this.settings.enableGlobalGraph;
    }
    if (viewType === "localgraph") {
      return this.settings.enableLocalGraph;
    }
    return false;
  }
}
