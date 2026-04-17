import { describe, expect, it } from "vitest";
import { MCGNRuntime } from "../src/main";

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

interface FakeNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

function createRuntimeHarness(viewType: "graph" | "localgraph" = "graph") {
  const added: FakeGraphics[] = [];
  const removed: FakeGraphics[] = [];
  const nodes: FakeNode[] = [{ id: "note.md", x: 10, y: 20, r: 4 }];

  const renderer = {
    nodes,
    renderCallback() {},
    px: {
      stage: {
        addChild(graphic: FakeGraphics) {
          added.push(graphic);
        },
        removeChild(graphic: FakeGraphics) {
          removed.push(graphic);
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

  return { runtime, view, renderer, nodes, tagsByPath, warnings, added, removed };
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

    expect(harness.added).toHaveLength(0);
  });

  it("destroy restores original renderer callback", () => {
    const harness = createRuntimeHarness();
    const original = harness.renderer.renderCallback;

    harness.runtime.attachView(harness.view);
    expect(harness.renderer.renderCallback).not.toBe(original);

    harness.runtime.destroy();
    expect(harness.renderer.renderCallback).toBe(original);
  });

  it("applies rename then delete invalidation paths", () => {
    const harness = createRuntimeHarness();
    harness.runtime.attachView(harness.view);
    harness.renderer.renderCallback();
    expect(harness.added.length).toBeGreaterThan(0);

    harness.runtime.onFileRename("note.md", "renamed.md");
    harness.nodes[0].id = "renamed.md";
    harness.tagsByPath.set("renamed.md", []);
    harness.renderer.renderCallback();
    expect(harness.added.length).toBeGreaterThan(0);

    harness.runtime.onFileDelete("renamed.md");
    harness.renderer.renderCallback();
    expect(harness.removed.length).toBeGreaterThan(0);
  });
});
