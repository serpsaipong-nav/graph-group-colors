export const ADDITIVE_SCENARIO_IDS = ["A1", "A2", "A3"] as const;
export const NET_PERF_SCENARIO_IDS = ["B1", "B2", "B3"] as const;
export const LIFECYCLE_CHECK_IDS = [
  "LIFECYCLE_MEMORY_MB",
  "LIFECYCLE_ATTACH_MS",
  "LIFECYCLE_UNLOAD_MS"
] as const;

export type AdditiveScenarioId = (typeof ADDITIVE_SCENARIO_IDS)[number];
export type NetPerfScenarioId = (typeof NET_PERF_SCENARIO_IDS)[number];
export type LifecycleCheckId = (typeof LIFECYCLE_CHECK_IDS)[number];
export type ScenarioOrLifecycleId =
  | AdditiveScenarioId
  | NetPerfScenarioId
  | LifecycleCheckId;

export type ThresholdStatus = "pass" | "warn" | "fail";

export interface ThresholdOutcome {
  readonly id: ScenarioOrLifecycleId;
  readonly actual: number;
  readonly status: ThresholdStatus;
  readonly message: string;
}

type ThresholdMode = "max" | "min" | "range";

interface RangeTarget {
  readonly min: number;
  readonly max: number;
}

interface ScenarioTarget {
  readonly mode: ThresholdMode;
  readonly pass: number | RangeTarget;
  readonly warn?: number | RangeTarget;
  readonly unit: string;
  readonly description: string;
}

type ThresholdTargetById = { readonly [K in ScenarioOrLifecycleId]: ScenarioTarget };

export const DEFAULT_TARGETS: ThresholdTargetById = {
  A1: {
    mode: "max",
    pass: 1,
    warn: 2,
    unit: "ms",
    description: "Additive overhead at 500 visible nodes, all multi-color."
  },
  A2: {
    mode: "max",
    pass: 4,
    warn: 8,
    unit: "ms",
    description: "Additive overhead at 2,000 visible nodes, all multi-color."
  },
  A3: {
    mode: "max",
    pass: 0.1,
    warn: 0.2,
    unit: "ms",
    description: "Additive overhead at 500 nodes, 0% multi-color."
  },
  B1: {
    mode: "min",
    pass: 0,
    warn: -5,
    unit: "%",
    description: "Perf toggles OFF should not regress active simulation."
  },
  B2: {
    mode: "range",
    pass: { min: 20, max: 40 },
    warn: { min: 1, max: 50 },
    unit: "%",
    description: "Perf toggles ON active simulation improvement target."
  },
  B3: {
    mode: "range",
    pass: { min: -10, max: 10 },
    warn: { min: -15, max: 15 },
    unit: "%",
    description: "Idle panning should stay within +/-10% of stock."
  },
  LIFECYCLE_MEMORY_MB: {
    mode: "max",
    pass: 50,
    warn: 60,
    unit: "MB",
    description: "Memory overhead at 5,000 nodes."
  },
  LIFECYCLE_ATTACH_MS: {
    mode: "max",
    pass: 150,
    warn: 200,
    unit: "ms",
    description: "Initial attach latency."
  },
  LIFECYCLE_UNLOAD_MS: {
    mode: "max",
    pass: 50,
    warn: 75,
    unit: "ms",
    description: "Unload latency."
  }
};

function asRange(value: number | RangeTarget): RangeTarget {
  if (typeof value === "number") {
    return { min: value, max: value };
  }

  return value;
}

function evaluateMax(actual: number, pass: number, warn?: number): ThresholdStatus {
  if (actual <= pass) {
    return "pass";
  }
  if (warn !== undefined && actual <= warn) {
    return "warn";
  }
  return "fail";
}

function evaluateMin(actual: number, pass: number, warn?: number): ThresholdStatus {
  if (actual >= pass) {
    return "pass";
  }
  if (warn !== undefined && actual >= warn) {
    return "warn";
  }
  return "fail";
}

function evaluateRange(actual: number, pass: RangeTarget, warn?: RangeTarget): ThresholdStatus {
  if (actual >= pass.min && actual <= pass.max) {
    return "pass";
  }
  if (warn && actual >= warn.min && actual <= warn.max) {
    return "warn";
  }
  return "fail";
}

function evaluateAgainstTarget(actual: number, target: ScenarioTarget): ThresholdStatus {
  if (!Number.isFinite(actual)) {
    throw new Error("Scenario value must be a finite number.");
  }

  if (target.mode === "max") {
    if (typeof target.pass !== "number") {
      throw new Error("Max target pass threshold must be numeric.");
    }
    if (target.warn !== undefined && typeof target.warn !== "number") {
      throw new Error("Max target warn threshold must be numeric.");
    }
    return evaluateMax(actual, target.pass, target.warn);
  }

  if (target.mode === "min") {
    if (typeof target.pass !== "number") {
      throw new Error("Min target pass threshold must be numeric.");
    }
    if (target.warn !== undefined && typeof target.warn !== "number") {
      throw new Error("Min target warn threshold must be numeric.");
    }
    return evaluateMin(actual, target.pass, target.warn);
  }

  return evaluateRange(actual, asRange(target.pass), target.warn ? asRange(target.warn) : undefined);
}

function formatExpectation(target: ScenarioTarget): string {
  if (target.mode === "max") {
    if (typeof target.pass !== "number") {
      throw new Error("Invalid max target.");
    }
    return `<= ${target.pass}${target.unit}`;
  }

  if (target.mode === "min") {
    if (typeof target.pass !== "number") {
      throw new Error("Invalid min target.");
    }
    return `>= ${target.pass}${target.unit}`;
  }

  const pass = asRange(target.pass);
  return `${pass.min}${target.unit} to ${pass.max}${target.unit}`;
}

export function evaluateScenarioOutcome(
  id: ScenarioOrLifecycleId,
  actual: number,
  targets: ThresholdTargetById = DEFAULT_TARGETS
): ThresholdOutcome {
  const target = targets[id];
  const status = evaluateAgainstTarget(actual, target);
  const expectation = formatExpectation(target);
  const message = `${id} ${target.description} actual=${actual}${target.unit}, target=${expectation}`;

  return {
    id,
    actual,
    status,
    message
  };
}

export function evaluateScenarioOutcomes(
  actualById: Partial<Record<ScenarioOrLifecycleId, number>>,
  targets: ThresholdTargetById = DEFAULT_TARGETS
): ThresholdOutcome[] {
  const outcomes: ThresholdOutcome[] = [];
  for (const id of Object.keys(actualById) as ScenarioOrLifecycleId[]) {
    const value = actualById[id];
    if (value === undefined) {
      continue;
    }
    outcomes.push(evaluateScenarioOutcome(id, value, targets));
  }
  return outcomes;
}
