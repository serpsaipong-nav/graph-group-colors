import { describe, expect, it } from "vitest";
import { runHarness } from "./harness";

describe("perf harness smoke", () => {
  it("runs matrix and returns basic metrics", () => {
    const results = runHarness(5, 1);
    expect(results.runtime).toBe("MCGNRuntime");
    expect(results.scenarios).toHaveLength(6);
    expect(results.thresholdOutcomes.length).toBeGreaterThan(0);
    expect(results.decision.result).toMatch(/go|no-go|pending/);
    for (const scenario of results.scenarios) {
      expect(scenario.nodeCount).toBeGreaterThan(0);
      expect(scenario.runs).toBe(1);
      expect(scenario.baseline.medianFrameMs).toBeGreaterThanOrEqual(0);
      expect(scenario.candidate.medianFrameMs).toBeGreaterThanOrEqual(0);
    }
  });
});
