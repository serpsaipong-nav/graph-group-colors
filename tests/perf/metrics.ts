export interface AggregatedRuns {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
}

function assertFiniteRuns(runs: readonly number[]): void {
  if (runs.length === 0) {
    throw new Error("Expected at least one run.");
  }

  for (const value of runs) {
    if (!Number.isFinite(value)) {
      throw new Error("Run values must be finite numbers.");
    }
  }
}

export function aggregateRuns(runs: readonly number[]): AggregatedRuns {
  assertFiniteRuns(runs);

  let min = runs[0];
  let max = runs[0];
  let sum = 0;
  for (const value of runs) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
    sum += value;
  }

  const sorted = [...runs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    min,
    max,
    mean: sum / runs.length,
    median
  };
}

export function calculateAdditiveOverhead(
  stockFrameTimeMs: number,
  pluginFrameTimeMs: number
): number {
  if (!Number.isFinite(stockFrameTimeMs) || !Number.isFinite(pluginFrameTimeMs)) {
    throw new Error("Frame times must be finite numbers.");
  }

  return pluginFrameTimeMs - stockFrameTimeMs;
}

export function calculatePercentImprovement(
  baselineFrameTimeMs: number,
  candidateFrameTimeMs: number
): number {
  if (!Number.isFinite(baselineFrameTimeMs) || !Number.isFinite(candidateFrameTimeMs)) {
    throw new Error("Frame times must be finite numbers.");
  }
  if (baselineFrameTimeMs <= 0) {
    throw new Error("Baseline frame time must be greater than zero.");
  }

  return ((baselineFrameTimeMs - candidateFrameTimeMs) / baselineFrameTimeMs) * 100;
}
