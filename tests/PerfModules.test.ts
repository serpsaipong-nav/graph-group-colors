import { describe, expect, it } from "vitest";
import { OverlayCap } from "../src/graph/perf/OverlayCap";
import { FrameThrottle } from "../src/graph/perf/Throttle";
import {
  isNodeVisibleInViewport,
  viewportFromTransform
} from "../src/graph/perf/ViewportCull";

describe("FrameThrottle", () => {
  it("skips throttling when simulation is settled", () => {
    const throttle = new FrameThrottle({ enabled: true, interval: 3 });
    expect(throttle.shouldDraw(false)).toBe(true);
    expect(throttle.shouldDraw(false)).toBe(true);
  });

  it("draws every Nth frame while simulation is active", () => {
    const throttle = new FrameThrottle({ enabled: true, interval: 2 });
    expect(throttle.shouldDraw(true)).toBe(false);
    expect(throttle.shouldDraw(true)).toBe(true);
    expect(throttle.shouldDraw(true)).toBe(false);
    expect(throttle.shouldDraw(true)).toBe(true);
  });
});

describe("Viewport culling", () => {
  it("creates graph-space bounds from renderer transform", () => {
    const bounds = viewportFromTransform(1000, 800, {
      panX: -200,
      panY: -100,
      scale: 2
    });

    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(50);
    expect(bounds.right).toBe(600);
    expect(bounds.bottom).toBe(450);
  });

  it("detects node visibility with radius padding", () => {
    const visible = isNodeVisibleInViewport(
      { x: 12, y: 12, r: 4 },
      { left: 0, right: 20, top: 0, bottom: 20 }
    );
    expect(visible).toBe(true);

    const hidden = isNodeVisibleInViewport(
      { x: 40, y: 40, r: 4 },
      { left: 0, right: 20, top: 0, bottom: 20 }
    );
    expect(hidden).toBe(false);
  });
});

describe("OverlayCap", () => {
  it("disables overlays above configured threshold", () => {
    const cap = new OverlayCap({ enabled: true, maxVisibleNodes: 250 });
    expect(cap.getMaxVisibleNodes()).toBe(250);
    expect(cap.canRenderOverlays(240)).toBe(true);
    expect(cap.canRenderOverlays(251)).toBe(false);
  });
});
