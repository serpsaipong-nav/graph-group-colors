import { describe, expect, it } from "vitest";
import {
  NodeOverlay,
  type GroupColor,
  type PixiContainerLike,
  type PixiGraphicsLike
} from "../src/graph/NodeOverlay";

class FakeGraphics implements PixiGraphicsLike {
  public x = 0;
  public y = 0;
  public destroyed = false;
  public calls: string[] = [];

  clear(): void {
    this.calls.push("clear");
  }
  beginFill(color: number, alpha?: number): void {
    this.calls.push(`beginFill:${color}:${alpha ?? 1}`);
  }
  moveTo(x: number, y: number): void {
    this.calls.push(`moveTo:${x}:${y}`);
  }
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
    this.calls.push(`arc:${x}:${y}:${radius}:${startAngle}:${endAngle}`);
  }
  lineTo(x: number, y: number): void {
    this.calls.push(`lineTo:${x}:${y}`);
  }
  endFill(): void {
    this.calls.push("endFill");
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeContainer implements PixiContainerLike {
  public added: FakeGraphics[] = [];
  public removed: FakeGraphics[] = [];

  addChild(child: PixiGraphicsLike): void {
    this.added.push(child as FakeGraphics);
  }
  removeChild(child: PixiGraphicsLike): void {
    this.removed.push(child as FakeGraphics);
  }
}

const colors: GroupColor[] = [
  { rgb: 0x0000ff, alpha: 1 },
  { rgb: 0xff9900, alpha: 0.8 },
  { rgb: 0x00ff00, alpha: 0.7 }
];

const legacyOpts = { maxColorsPerNode: 6, graphicsDrawMode: "legacy" as const };

describe("NodeOverlay", () => {
  it("skips overlay creation for zero or one color", () => {
    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeGraphics(), legacyOpts);

    overlay.draw({ id: "a", x: 1, y: 2, r: 10 }, []);
    overlay.draw({ id: "a", x: 1, y: 2, r: 10 }, [colors[0]]);

    expect(container.added).toHaveLength(0);
    expect(overlay.getOverlayCount()).toBe(0);
  });

  it("draws one slice per color for multi-color nodes", () => {
    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeGraphics(), legacyOpts);

    overlay.draw({ id: "a", x: 20, y: 30, r: 5 }, [colors[0], colors[1]]);

    expect(container.added).toHaveLength(1);
    const graphics = container.added[0];
    expect(graphics.calls.filter((c) => c.startsWith("beginFill"))).toHaveLength(2);
    expect(graphics.x).toBe(20);
    expect(graphics.y).toBe(30);
  });

  it("caps slices based on maxColorsPerNode", () => {
    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeGraphics(), {
      maxColorsPerNode: 2,
      graphicsDrawMode: "legacy"
    });

    overlay.draw({ id: "a", x: 0, y: 0, r: 5 }, colors);

    const graphics = container.added[0];
    expect(graphics.calls.filter((c) => c.startsWith("beginFill"))).toHaveLength(2);
  });

  it("reuses overlays and skips redraw when state is unchanged", () => {
    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeGraphics(), legacyOpts);

    overlay.draw({ id: "a", x: 5, y: 5, r: 4 }, [colors[0], colors[1]]);
    const graphics = container.added[0];
    const callCount = graphics.calls.length;

    overlay.draw({ id: "a", x: 5, y: 5, r: 4 }, [colors[0], colors[1]]);

    expect(container.added).toHaveLength(1);
    expect(graphics.calls).toHaveLength(callCount);
  });

  it("clears and destroys an overlay for a node", () => {
    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeGraphics(), legacyOpts);

    overlay.draw({ id: "a", x: 0, y: 0, r: 3 }, [colors[0], colors[1]]);
    const graphics = container.added[0];
    overlay.clear("a");

    expect(container.removed).toContain(graphics);
    expect(graphics.destroyed).toBe(true);
    expect(overlay.getOverlayCount()).toBe(0);
  });

  it("uses Pixi-style fill per slice in v8 mode", () => {
    class FakeV8 implements PixiGraphicsLike {
      public x = 0;
      public y = 0;
      public calls: string[] = [];
      clear(): void {
        this.calls.push("clear");
      }
      moveTo(x: number, y: number): void {
        this.calls.push(`moveTo:${x}:${y}`);
      }
      arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
        this.calls.push(`arc:${x}:${y}:${radius}:${startAngle}:${endAngle}`);
      }
      lineTo(x: number, y: number): void {
        this.calls.push(`lineTo:${x}:${y}`);
      }
      fill(style: { color: number; alpha?: number }): void {
        this.calls.push(`fill:${style.color}:${style.alpha ?? 1}`);
      }
      destroy(): void {}
    }

    const container = new FakeContainer();
    const overlay = new NodeOverlay(container, () => new FakeV8(), {
      maxColorsPerNode: 6,
      graphicsDrawMode: "v8"
    });
    overlay.draw({ id: "a", x: 1, y: 2, r: 4 }, [colors[0], colors[1]]);
    const graphics = container.added[0] as FakeV8;
    expect(graphics.calls.filter((c) => c.startsWith("fill:"))).toHaveLength(2);
    expect(graphics.calls.some((c) => c.startsWith("beginFill"))).toBe(false);
  });
});
