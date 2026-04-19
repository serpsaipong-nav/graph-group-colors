import { describe, expect, it } from "vitest";
import { tryResolveGraphOverlayParent, type RendererInternal } from "../src/utils/obsidianInternals";

function makeStage() {
  const children: unknown[] = [];
  return {
    children,
    addChild(c: unknown) {
      children.push(c);
    },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) {
        children.splice(i, 1);
      }
    }
  };
}

describe("tryResolveGraphOverlayParent", () => {
  it("uses inner container when node.circle.parent is a valid PIXI-like container", () => {
    const world = makeStage();
    const circle = { parent: world };
    const stage = makeStage();
    const renderer = {
      nodes: [{ id: "a.md", x: 0, y: 0, r: 3, circle }],
      renderCallback() {},
      px: { stage }
    } as unknown as RendererInternal;

    const { parent, usedStageFallback } = tryResolveGraphOverlayParent(renderer, renderer.nodes[0]);
    expect(usedStageFallback).toBe(false);
    expect(parent).toBe(world);
  });

  it("falls back to stage when no display object parent is found", () => {
    const stage = makeStage();
    const renderer = {
      nodes: [{ id: "a.md", x: 0, y: 0, r: 3 }],
      renderCallback() {},
      px: { stage }
    } as unknown as RendererInternal;

    const { parent, usedStageFallback } = tryResolveGraphOverlayParent(renderer, renderer.nodes[0]);
    expect(usedStageFallback).toBe(true);
    expect(parent).toBe(stage);
  });

  it("uses renderer.world when present and valid", () => {
    const world = makeStage();
    const stage = makeStage();
    const renderer = {
      nodes: [{ id: "a.md", x: 0, y: 0, r: 3 }],
      world,
      renderCallback() {},
      px: { stage }
    } as unknown as RendererInternal;

    const { parent, usedStageFallback } = tryResolveGraphOverlayParent(renderer, renderer.nodes[0]);
    expect(usedStageFallback).toBe(false);
    expect(parent).toBe(world);
  });
});
