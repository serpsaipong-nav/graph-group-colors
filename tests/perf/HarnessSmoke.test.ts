import { describe, expect, it } from "vitest";
import { runHarness } from "./harness";

describe("perf harness smoke", () => {
  it("runs matrix and returns basic metrics", () => {
    const results = runHarness(5);
    expect(results.runtime).toBe("MCGNRuntime");
    expect(results.scenarios).toHaveLength(6);
    for (const scenario of results.scenarios) {
      expect(scenario.nodeCount).toBeGreaterThan(0);
      expect(scenario.renderedFrames).toBe(5);
      expect(scenario.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });
});
