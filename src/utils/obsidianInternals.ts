export interface GraphNodeInternal {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface PixiGraphicsInternal {
  destroy(): void;
}

export interface PixiContainerInternal {
  addChild(child: PixiGraphicsInternal): void;
  removeChild(child: PixiGraphicsInternal): void;
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

export function isGraphLikeView(view: unknown): view is GraphViewInternal {
  if (!isObject(view)) {
    return false;
  }
  const getViewType = (view as { getViewType?: unknown }).getViewType;
  if (typeof getViewType !== "function") {
    return false;
  }
  const viewType = (getViewType as () => string)();
  return viewType === "graph" || viewType === "localgraph";
}
