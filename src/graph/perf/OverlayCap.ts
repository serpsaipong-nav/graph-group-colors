export interface OverlayCapOptions {
  enabled: boolean;
  maxVisibleNodes: number;
}

export class OverlayCap {
  private enabled = false;
  private maxVisibleNodes = Number.POSITIVE_INFINITY;

  constructor(options: OverlayCapOptions) {
    this.configure(options);
  }

  configure(options: OverlayCapOptions): void {
    this.enabled = options.enabled;
    this.maxVisibleNodes = options.enabled
      ? Math.max(1, Math.floor(options.maxVisibleNodes))
      : Number.POSITIVE_INFINITY;
  }

  canRenderOverlays(visibleNodeCount: number): boolean {
    if (!this.enabled) {
      return true;
    }
    return visibleNodeCount <= this.maxVisibleNodes;
  }

  getMaxVisibleNodes(): number {
    return this.maxVisibleNodes;
  }
}
