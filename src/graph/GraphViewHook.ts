import {
  getRendererFromView,
  isGraphLikeView,
  type RendererInternal
} from "../utils/obsidianInternals";

export interface GraphViewHookLogger {
  warn(message: string, error?: unknown): void;
}

export interface GraphViewHookOptions {
  maxConsecutiveErrors?: number;
}

export type OnFrame = (renderer: RendererInternal) => void;

export interface HookHandle {
  detach(): void;
  isAttached(): boolean;
}

export class GraphViewHook {
  private readonly maxConsecutiveErrors: number;
  private detached = false;
  private errorCount = 0;
  private readonly originalRenderCallback: (...args: unknown[]) => void;

  constructor(
    private readonly renderer: RendererInternal,
    private readonly onFrame: OnFrame,
    private readonly logger: GraphViewHookLogger,
    options: GraphViewHookOptions = {}
  ) {
    this.maxConsecutiveErrors = Math.max(1, Math.floor(options.maxConsecutiveErrors ?? 5));
    this.originalRenderCallback = renderer.renderCallback;
  }

  attach(): HookHandle {
    const hook = this;
    this.renderer.renderCallback = function patchedRenderCallback(this: unknown, ...args: unknown[]) {
      hook.originalRenderCallback.apply(this, args);
      if (hook.detached) {
        return;
      }
      try {
        hook.onFrame(hook.renderer);
        hook.errorCount = 0;
      } catch (error) {
        hook.errorCount += 1;
        hook.logger.warn("[MCGN] Frame overlay error.", error);
        if (hook.errorCount >= hook.maxConsecutiveErrors) {
          hook.logger.warn("[MCGN] Overlay hook disabled after repeated errors.");
          hook.detach();
        }
      }
    };

    return {
      detach: () => this.detach(),
      isAttached: () => !this.detached
    };
  }

  detach(): void {
    if (this.detached) {
      return;
    }
    this.renderer.renderCallback = this.originalRenderCallback;
    this.detached = true;
  }
}

export function tryAttachGraphView(
  view: unknown,
  onFrame: OnFrame,
  logger: GraphViewHookLogger,
  options?: GraphViewHookOptions
): HookHandle | null {
  if (!isGraphLikeView(view)) {
    return null;
  }

  const renderer = getRendererFromView(view);
  if (!renderer) {
    logger.warn("[MCGN] Unexpected graph renderer shape, skipping hook.");
    return null;
  }

  const hook = new GraphViewHook(renderer, onFrame, logger, options);
  return hook.attach();
}
