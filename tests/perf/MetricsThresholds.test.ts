import { describe, expect, it } from "vitest";
import {
  aggregateRuns,
  calculateAdditiveOverhead,
  calculatePercentImprovement
} from "./metrics";
import {
  ADDITIVE_SCENARIO_IDS,
  LIFECYCLE_CHECK_IDS,
  NET_PERF_SCENARIO_IDS,
  evaluateScenarioOutcome,
  evaluateScenarioOutcomes,
  summarizeThresholdOutcomes
} from "./thresholds";

describe("metrics helpers", () => {
  it("aggregates median/min/max/mean from runs", () => {
    const stats = aggregateRuns([10, 15, 5, 20, 8]);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(20);
    expect(stats.mean).toBeCloseTo(11.6);
    expect(stats.median).toBe(10);
  });

  it("calculates additive overhead from stock and plugin frame times", () => {
    const overhead = calculateAdditiveOverhead(12.5, 13.4);
    expect(overhead).toBeCloseTo(0.9);
  });

  it("calculates percent improvement where lower frame time is better", () => {
    const improvement = calculatePercentImprovement(20, 15);
    expect(improvement).toBeCloseTo(25);
  });
});

describe("threshold scenario ids", () => {
  it("exports additive, net-perf, and lifecycle ids", () => {
    expect(ADDITIVE_SCENARIO_IDS).toEqual(["A1", "A2", "A3"]);
    expect(NET_PERF_SCENARIO_IDS).toEqual(["B1", "B2", "B3"]);
    expect(LIFECYCLE_CHECK_IDS).toEqual([
      "LIFECYCLE_MEMORY_MB",
      "LIFECYCLE_ATTACH_MS",
      "LIFECYCLE_UNLOAD_MS"
    ]);
  });
});

describe("threshold evaluation", () => {
  it("marks overhead targets pass/warn/fail by threshold bands", () => {
    expect(evaluateScenarioOutcome("A1", 0.8).status).toBe("pass");
    expect(evaluateScenarioOutcome("A1", 1.5).status).toBe("warn");
    expect(evaluateScenarioOutcome("A1", 2.2).status).toBe("fail");
  });

  it("evaluates range-based performance scenarios", () => {
    expect(evaluateScenarioOutcome("B2", 25).status).toBe("pass");
    expect(evaluateScenarioOutcome("B2", 10).status).toBe("warn");
    expect(evaluateScenarioOutcome("B2", -2).status).toBe("fail");
  });

  it("evaluates lifecycle checks against max thresholds", () => {
    expect(evaluateScenarioOutcome("LIFECYCLE_MEMORY_MB", 49).status).toBe("pass");
    expect(evaluateScenarioOutcome("LIFECYCLE_ATTACH_MS", 180).status).toBe("warn");
    expect(evaluateScenarioOutcome("LIFECYCLE_UNLOAD_MS", 90).status).toBe("fail");
  });

  it("evaluates a batch of scenario outcomes", () => {
    const outcomes = evaluateScenarioOutcomes({
      A2: 3.2,
      B3: 12,
      LIFECYCLE_ATTACH_MS: 120
    });

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]?.status).toBe("pass");
    expect(outcomes[1]?.status).toBe("warn");
    expect(outcomes[2]?.status).toBe("pass");
  });

  it("summarizes go/no-go from threshold outcomes", () => {
    const outcomes = evaluateScenarioOutcomes({
      A1: 0.9,
      A2: 3.9,
      A3: 0.05,
      B1: 8,
      B2: 22,
      B3: 5,
      LIFECYCLE_ATTACH_MS: 80,
      LIFECYCLE_UNLOAD_MS: 20,
      LIFECYCLE_MEMORY_MB: 35
    });
    const summary = summarizeThresholdOutcomes(outcomes);
    expect(summary.decision).toBe("go");
    expect(summary.failedIds).toHaveLength(0);
  });
});
