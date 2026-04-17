import { describe, expect, it } from "vitest";
import { renderPerfReport } from "./report";

describe("renderPerfReport", () => {
  it("renders placeholders when no measurements are provided", () => {
    const report = renderPerfReport();

    expect(report).toContain("# M4 Perf Report");
    expect(report).toContain("- Mean frame time (ms): Not run");
    expect(report).toContain("- p95 frame time delta (ms): Not run");
    expect(report).toContain("- Go/No-Go: pending");
    expect(report).toContain("- Invariant: additive rendering unchanged: not-run");
    expect(report).toContain("- No threshold outcomes recorded");
  });

  it("renders metrics and computed deltas from provided results", () => {
    const report = renderPerfReport({
      date: "2026-04-17",
      branch: "m4/c-reporting",
      commit: "abc1234",
      environment: "macOS 14, synthetic 5k vault",
      runner: "vitest perf harness",
      notes: "single rerun after warm cache",
      baseline: {
        meanFrameMs: 8.5,
        p95FrameMs: 13.0,
        maxFrameMs: 18.2
      },
      candidate: {
        meanFrameMs: 7.9,
        p95FrameMs: 12.4,
        maxFrameMs: 17.0
      },
      checks: {
        additiveRendering: "pass",
        failSafeRestore: "pass",
        skipPathCost: "pass"
      },
      thresholdOutcomes: [
        {
          id: "A1",
          status: "pass",
          message: "A1 actual=0.7ms target<=1ms"
        }
      ],
      decision: {
        result: "go",
        rationale: "Candidate improves frame-time metrics without regressions.",
        followUps: "Re-run after integration branch merge."
      }
    });

    expect(report).toContain("- Mean frame time (ms): 8.500");
    expect(report).toContain("- Mean frame time (ms): 7.900");
    expect(report).toContain("- Mean frame time delta (ms): -0.600");
    expect(report).toContain("- p95 frame time delta (ms): -0.600");
    expect(report).toContain("- Max frame time delta (ms): -1.200");
    expect(report).toContain("- Go/No-Go: go");
    expect(report).toContain("- Follow-ups: Re-run after integration branch merge.");
    expect(report).toContain("- A1: pass (A1 actual=0.7ms target<=1ms)");
  });

  it("treats invalid numeric values as not run", () => {
    const report = renderPerfReport({
      baseline: {
        meanFrameMs: Number.NaN
      },
      candidate: {
        meanFrameMs: Number.POSITIVE_INFINITY
      }
    });

    expect(report).toContain("- Mean frame time (ms): Not run");
    expect(report).toContain("- Mean frame time delta (ms): Not run");
  });
});
