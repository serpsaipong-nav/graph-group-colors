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

export interface NodeOverlayOptions {
  maxColorsPerNode: number;
}

export interface PixiGraphicsLike {
  x: number;
  y: number;
  clear(): void;
  beginFill(color: number, alpha?: number): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  lineTo(x: number, y: number): void;
  endFill(): void;
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

  constructor(
    private readonly container: PixiContainerLike,
    private readonly createGraphic: GraphicsFactory,
    options: NodeOverlayOptions
  ) {
    this.maxColorsPerNode = Math.max(2, Math.floor(options.maxColorsPerNode));
  }

  setMaxColorsPerNode(maxColorsPerNode: number): void {
    this.maxColorsPerNode = Math.max(2, Math.floor(maxColorsPerNode));
  }

  draw(node: GraphNodeLike, colors: readonly GroupColor[]): void {
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
    const state = this.overlayByNodeId.get(nodeId);
    if (!state) {
      return;
    }
    this.container.removeChild(state.graphic);
    state.graphic.destroy();
    this.overlayByNodeId.delete(nodeId);
  }

  destroy(): void {
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
      graphic.beginFill(color.rgb, color.alpha);
      graphic.moveTo(0, 0);
      graphic.arc(0, 0, node.r, start, end);
      graphic.lineTo(0, 0);
      graphic.endFill();
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
