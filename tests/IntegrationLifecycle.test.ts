import { describe, expect, it } from "vitest";
import { MCGNRuntime } from "../src/main";
import type { PixiGraphicsLike } from "../src/graph/NodeOverlay";
import type { PixiOverlayMountLike } from "../src/utils/obsidianInternals";

class FakeGraphics {
  public x = 0;
  public y = 0;
  destroy(): void {}
  clear(): void {}
  beginFill(): void {}
  moveTo(): void {}
  arc(): void {}
  lineTo(): void {}
  endFill(): void {}
}

class FakeMount implements PixiOverlayMountLike {
  public readonly overlayGraphics: FakeGraphics[] = [];
  public removed: FakeGraphics[] = [];

  addChild(child: PixiGraphicsLike): void {
    this.overlayGraphics.push(child as FakeGraphics);
  }

  removeChild(child: PixiGraphicsLike): void {
    this.removed.push(child as FakeGraphics);
  }

  destroy(): void {}
}

interface FakeNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

function createRuntimeHarness(viewType: "graph" | "localgraph" = "graph") {
  const mount = new FakeMount();
  const stageChildren: unknown[] = [];
  const nodes: FakeNode[] = [{ id: "note.md", x: 10, y: 20, r: 4 }];

  const renderer = {
    nodes,
    renderCallback() {},
    panX: 0,
    panY: 0,
    scale: 1,
    width: 800,
    height: 600,
    px: {
      stage: {
        children: stageChildren,
        addChild(child: unknown) {
          stageChildren.push(child);
        },
        removeChild(child: unknown) {
          const i = stageChildren.indexOf(child);
          if (i >= 0) {
            stageChildren.splice(i, 1);
          }
        }
      }
    }
  };

  const view = {
    renderer,
    getViewType: () => viewType
  };

  const tagsByPath = new Map<string, string[]>([
    ["note.md", ["#a", "#b"]]
  ]);

  const warnings: string[] = [];
  const runtime = new MCGNRuntime({
    logger: {
      warn(message: string) {
        warnings.push(message);
      }
    },
    createGraphics() {
      return new FakeGraphics();
    },
    createOverlayMount() {
      return mount;
    },
    getPixiGraphicsDrawMode() {
      return "legacy" as const;
    },
    getNodeTags(path: string) {
      return tagsByPath.get(path) ?? [];
    },
    getAllGraphViews() {
      return [view];
    }
  });

  runtime.loadGraphConfig({
    colorGroups: [
      { query: "tag:#a", color: { rgb: 0x123456, a: 1 } },
      { query: "tag:#b", color: { rgb: 0xabcdef, a: 1 } }
    ]
  });

  return { runtime, view, renderer, nodes, tagsByPath, warnings, mount, stageChildren };
}

describe("M3 lifecycle integration", () => {
  it("prevents duplicate attach for the same view", () => {
    const harness = createRuntimeHarness();
    harness.runtime.attachView(harness.view);
    harness.runtime.attachView(harness.view);

    expect(harness.runtime.getAttachedViewCount()).toBe(1);
  });

  it("kill switch skips overlay work", () => {
    const harness = createRuntimeHarness();
    harness.runtime.attachView(harness.view);
    harness.runtime.setSettings({ killSwitch: true });

    harness.renderer.renderCallback();

    expect(harness.mount.overlayGraphics).toHaveLength(0);
  });

  it("destroy restores original renderer callback", () => {
    const harness = createRuntimeHarness();
    const original = harness.renderer.renderCallback;

    harness.runtime.attachView(harness.view);
    expect(harness.renderer.renderCallback).not.toBe(original);

    harness.runtime.destroy();
    expect(harness.renderer.renderCallback).toBe(original);
  });

  it("applies cache invalidation on delete so overlays can be removed", () => {
    const harness = createRuntimeHarness();
    harness.runtime.attachView(harness.view);
    harness.renderer.renderCallback();
    expect(harness.mount.overlayGraphics.length).toBeGreaterThan(0);

    harness.runtime.onFileDelete("note.md");
    harness.tagsByPath.set("note.md", []);
    harness.renderer.renderCallback();
    expect(harness.mount.removed.length).toBeGreaterThan(0);
  });

  it("maps graph node ids with leading ./ to vault paths for tag lookup", () => {
    const harness = createRuntimeHarness();
    harness.nodes[0].id = "./note.md";
    harness.runtime.attachView(harness.view);
    harness.renderer.renderCallback();
    expect(harness.mount.overlayGraphics.length).toBeGreaterThan(0);
  });

  it("keeps overlay mount on the renderer stage across render frames (screen-space drawing)", () => {
    const harness = createRuntimeHarness();
    harness.runtime.attachView(harness.view);
    harness.renderer.renderCallback();
    expect(harness.stageChildren.includes(harness.mount)).toBe(true);
    harness.renderer.renderCallback();
    expect(harness.stageChildren.includes(harness.mount)).toBe(true);
  });

  it("ten attach/detach cycles leave the renderer callback and stage pristine (Invariant 2)", () => {
    const harness = createRuntimeHarness();
    const originalCallback = harness.renderer.renderCallback;

    for (let i = 0; i < 10; i += 1) {
      harness.runtime.attachView(harness.view);
      expect(harness.renderer.renderCallback).not.toBe(originalCallback);
      harness.runtime.detachView(harness.view);
      expect(harness.renderer.renderCallback).toBe(originalCallback);
      expect(harness.stageChildren).not.toContain(harness.mount);
    }
  });
});
