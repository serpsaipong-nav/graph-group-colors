const FULL_CIRCLE_RAD = Math.PI * 2;
const START_ANGLE_RAD = -Math.PI / 2;

export interface GraphNodeLike {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface GroupColor {
  rgb: number;
  alpha: number;
}

export type PixiGraphicsDrawMode = "legacy" | "v8";

export interface NodeOverlayOptions {
  maxColorsPerNode: number;
  graphicsDrawMode: PixiGraphicsDrawMode;
}

export interface PixiGraphicsLike {
  x: number;
  y: number;
  clear(): void;
  beginFill?(color: number, alpha?: number): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  lineTo(x: number, y: number): void;
  endFill?(): void;
  /** Pixi v8: close path and apply fill. */
  fill?(style: { color: number; alpha?: number }): unknown;
  destroy(): void;
}

export interface PixiContainerLike {
  addChild(child: PixiGraphicsLike): void;
  removeChild(child: PixiGraphicsLike): void;
}

export type GraphicsFactory = () => PixiGraphicsLike;

interface OverlayState {
  graphic: PixiGraphicsLike;
  x: number;
  y: number;
  r: number;
  colorSignature: string;
}

export class NodeOverlay {
  private readonly overlayByNodeId = new Map<string, OverlayState>();
  private maxColorsPerNode: number;
  private graphicsDrawMode: PixiGraphicsDrawMode;
  private destroyed = false;

  constructor(
    private readonly container: PixiContainerLike,
    private readonly createGraphic: GraphicsFactory,
    options: NodeOverlayOptions
  ) {
    this.maxColorsPerNode = Math.max(2, Math.floor(options.maxColorsPerNode));
    this.graphicsDrawMode = options.graphicsDrawMode;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  setMaxColorsPerNode(maxColorsPerNode: number): void {
    if (this.destroyed) {
      return;
    }
    this.maxColorsPerNode = Math.max(2, Math.floor(maxColorsPerNode));
  }

  setGraphicsDrawMode(mode: PixiGraphicsDrawMode): void {
    if (this.destroyed) {
      return;
    }
    this.graphicsDrawMode = mode;
  }

  draw(node: GraphNodeLike, colors: readonly GroupColor[]): void {
    if (this.destroyed) {
      return;
    }
    const cappedCount = Math.min(this.maxColorsPerNode, colors.length);
    if (cappedCount <= 1) {
      this.clear(node.id);
      return;
    }

    const colorSignature = this.buildColorSignature(colors, cappedCount);
    const existing = this.overlayByNodeId.get(node.id);
    if (
      existing &&
      existing.x === node.x &&
      existing.y === node.y &&
      existing.r === node.r &&
      existing.colorSignature === colorSignature
    ) {
      return;
    }

    const graphic = existing?.graphic ?? this.createAndAttachGraphic();
    this.drawSlices(graphic, node, colors, cappedCount);
    graphic.x = node.x;
    graphic.y = node.y;

    this.overlayByNodeId.set(node.id, {
      graphic,
      x: node.x,
      y: node.y,
      r: node.r,
      colorSignature
    });
  }

  clear(nodeId: string): void {
    if (this.destroyed) {
      return;
    }
    const state = this.overlayByNodeId.get(nodeId);
    if (!state) {
      return;
    }
    this.container.removeChild(state.graphic);
    state.graphic.destroy();
    this.overlayByNodeId.delete(nodeId);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const [nodeId, state] of this.overlayByNodeId.entries()) {
      this.container.removeChild(state.graphic);
      state.graphic.destroy();
      this.overlayByNodeId.delete(nodeId);
    }
  }

  getOverlayCount(): number {
    return this.overlayByNodeId.size;
  }

  private createAndAttachGraphic(): PixiGraphicsLike {
    const graphic = this.createGraphic();
    this.container.addChild(graphic);
    return graphic;
  }

  private drawSlices(
    graphic: PixiGraphicsLike,
    node: GraphNodeLike,
    colors: readonly GroupColor[],
    count: number
  ): void {
    const step = FULL_CIRCLE_RAD / count;
    let start = START_ANGLE_RAD;

    graphic.clear();
    for (let i = 0; i < count; i += 1) {
      const color = colors[i];
      const end = start + step;
      if (this.graphicsDrawMode === "v8" && typeof graphic.fill === "function") {
        graphic.moveTo(0, 0);
        graphic.arc(0, 0, node.r, start, end);
        graphic.lineTo(0, 0);
        graphic.fill({ color: color.rgb, alpha: color.alpha });
      } else if (typeof graphic.beginFill === "function" && typeof graphic.endFill === "function") {
        graphic.beginFill(color.rgb, color.alpha);
        graphic.moveTo(0, 0);
        graphic.arc(0, 0, node.r, start, end);
        graphic.lineTo(0, 0);
        graphic.endFill();
      } else if (typeof graphic.fill === "function") {
        graphic.moveTo(0, 0);
        graphic.arc(0, 0, node.r, start, end);
        graphic.lineTo(0, 0);
        graphic.fill({ color: color.rgb, alpha: color.alpha });
      }
      start = end;
    }
  }

  private buildColorSignature(colors: readonly GroupColor[], count: number): string {
    let signature = "";
    for (let i = 0; i < count; i += 1) {
      signature += `${colors[i].rgb}:${colors[i].alpha}|`;
    }
    return signature;
  }
}
