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
  /** Raw property as it existed before we patched — used on {@link detach} to restore exactly. */
  private readonly rawOriginalRenderCallback: (...args: unknown[]) => void;
  /** Pre-bound copy — used by the patched wrapper so `this` is always the renderer. */
  private readonly boundOriginalRenderCallback: (...args: unknown[]) => void;

  constructor(
    private readonly renderer: RendererInternal,
    private readonly onFrame: OnFrame,
    private readonly logger: GraphViewHookLogger,
    options: GraphViewHookOptions = {}
  ) {
    this.maxConsecutiveErrors = Math.max(1, Math.floor(options.maxConsecutiveErrors ?? 5));
    this.rawOriginalRenderCallback = renderer.renderCallback;
    // Bind a separate copy so the original always executes with the correct `this`, even if
    // Obsidian invokes the patched wrapper via a cached reference (e.g. inside a RAF loop) that
    // has lost the `renderer.` prefix. Without this bind, the original can silently no-op, which
    // leaves stock graph-group colors un-refreshed and looks like the plugin broke the renderer.
    this.boundOriginalRenderCallback = this.rawOriginalRenderCallback.bind(renderer);
  }

  attach(): HookHandle {
    const hook = this;
    this.renderer.renderCallback = function patchedRenderCallback(this: unknown, ...args: unknown[]) {
      // Always call the original with `this=renderer` via the pre-bound copy — see constructor.
      hook.boundOriginalRenderCallback(...args);
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
    // Restore the raw (un-bound) property so re-attach cycles don't accumulate bind wrappers.
    this.renderer.renderCallback = this.rawOriginalRenderCallback;
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
