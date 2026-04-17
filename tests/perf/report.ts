export type NumericMetric = number | null;
export type CheckStatus = "pass" | "fail" | "not-run";
export type DecisionResult = "go" | "no-go" | "pending";
export type ThresholdStatus = "pass" | "warn" | "fail";

export interface PerfResultStats {
  meanFrameMs: NumericMetric;
  p95FrameMs: NumericMetric;
  maxFrameMs: NumericMetric;
}

export interface PerfInvariantChecks {
  additiveRendering: CheckStatus;
  failSafeRestore: CheckStatus;
  skipPathCost: CheckStatus;
}

export interface PerfDecision {
  result: DecisionResult;
  rationale?: string;
  followUps?: string;
}

export interface ThresholdSummaryInput {
  id: string;
  status: ThresholdStatus;
  message: string;
}

export interface PerfReportInput {
  date?: string;
  branch?: string;
  commit?: string;
  environment?: string;
  runner?: string;
  notes?: string;
  baseline?: Partial<PerfResultStats>;
  candidate?: Partial<PerfResultStats>;
  checks?: Partial<PerfInvariantChecks>;
  decision?: Partial<PerfDecision>;
  thresholdOutcomes?: ThresholdSummaryInput[];
}

interface NormalizedPerfReport {
  date: string;
  branch: string;
  commit: string;
  environment: string;
  runner: string;
  notes: string;
  baseline: PerfResultStats;
  candidate: PerfResultStats;
  delta: PerfResultStats;
  checks: PerfInvariantChecks;
  decision: Required<PerfDecision>;
  thresholdOutcomes: ThresholdSummaryInput[];
}

const NOT_RECORDED = "Not run";

function normalizeMetric(value: NumericMetric | undefined): NumericMetric {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricDelta(candidate: NumericMetric, baseline: NumericMetric): NumericMetric {
  if (candidate === null || baseline === null) {
    return null;
  }
  return Number((candidate - baseline).toFixed(3));
}

function formatMetric(value: NumericMetric): string {
  return value === null ? NOT_RECORDED : value.toFixed(3);
}

function normalizeCheck(value: CheckStatus | undefined): CheckStatus {
  return value ?? "not-run";
}

function normalizeText(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : NOT_RECORDED;
}

function normalizeInput(input: PerfReportInput): NormalizedPerfReport {
  const baseline: PerfResultStats = {
    meanFrameMs: normalizeMetric(input.baseline?.meanFrameMs),
    p95FrameMs: normalizeMetric(input.baseline?.p95FrameMs),
    maxFrameMs: normalizeMetric(input.baseline?.maxFrameMs)
  };

  const candidate: PerfResultStats = {
    meanFrameMs: normalizeMetric(input.candidate?.meanFrameMs),
    p95FrameMs: normalizeMetric(input.candidate?.p95FrameMs),
    maxFrameMs: normalizeMetric(input.candidate?.maxFrameMs)
  };

  return {
    date: normalizeText(input.date),
    branch: normalizeText(input.branch),
    commit: normalizeText(input.commit),
    environment: normalizeText(input.environment),
    runner: normalizeText(input.runner),
    notes: normalizeText(input.notes),
    baseline,
    candidate,
    delta: {
      meanFrameMs: metricDelta(candidate.meanFrameMs, baseline.meanFrameMs),
      p95FrameMs: metricDelta(candidate.p95FrameMs, baseline.p95FrameMs),
      maxFrameMs: metricDelta(candidate.maxFrameMs, baseline.maxFrameMs)
    },
    checks: {
      additiveRendering: normalizeCheck(input.checks?.additiveRendering),
      failSafeRestore: normalizeCheck(input.checks?.failSafeRestore),
      skipPathCost: normalizeCheck(input.checks?.skipPathCost)
    },
    decision: {
      result: input.decision?.result ?? "pending",
      rationale: normalizeText(input.decision?.rationale),
      followUps: normalizeText(input.decision?.followUps)
    },
    thresholdOutcomes: input.thresholdOutcomes ?? []
  };
}

export function renderPerfReport(input: PerfReportInput = {}): string {
  const data = normalizeInput(input);
  const thresholdLines =
    data.thresholdOutcomes.length === 0
      ? ["- No threshold outcomes recorded"]
      : data.thresholdOutcomes.map(
          (outcome) => `- ${outcome.id}: ${outcome.status} (${outcome.message})`
        );

  return [
    "# M4 Perf Report",
    "",
    "## Metadata",
    "",
    `- Date: ${data.date}`,
    `- Branch: ${data.branch}`,
    `- Commit: ${data.commit}`,
    `- Environment: ${data.environment}`,
    `- Runner: ${data.runner}`,
    `- Notes: ${data.notes}`,
    "",
    "## Workflow",
    "",
    "1. Run baseline measurements (`npm run test:perf`) on stock behavior.",
    "2. Run plugin measurements with M4 perf features enabled.",
    "3. Record deltas and document any anomalies or reruns.",
    "4. Mark go/no-go based on acceptance criteria and data confidence.",
    "",
    "## Results",
    "",
    "### Baseline (stock / control)",
    "",
    `- Mean frame time (ms): ${formatMetric(data.baseline.meanFrameMs)}`,
    `- p95 frame time (ms): ${formatMetric(data.baseline.p95FrameMs)}`,
    `- Max frame time (ms): ${formatMetric(data.baseline.maxFrameMs)}`,
    "",
    "### M4 candidate",
    "",
    `- Mean frame time (ms): ${formatMetric(data.candidate.meanFrameMs)}`,
    `- p95 frame time (ms): ${formatMetric(data.candidate.p95FrameMs)}`,
    `- Max frame time (ms): ${formatMetric(data.candidate.maxFrameMs)}`,
    "",
    "### Delta (candidate - baseline)",
    "",
    `- Mean frame time delta (ms): ${formatMetric(data.delta.meanFrameMs)}`,
    `- p95 frame time delta (ms): ${formatMetric(data.delta.p95FrameMs)}`,
    `- Max frame time delta (ms): ${formatMetric(data.delta.maxFrameMs)}`,
    "",
    "## Acceptance checks",
    "",
    `- Invariant: additive rendering unchanged: ${data.checks.additiveRendering}`,
    `- Invariant: fail-safe and restore: ${data.checks.failSafeRestore}`,
    `- Invariant: skip path cost near-zero: ${data.checks.skipPathCost}`,
    "",
    "## Threshold outcomes",
    "",
    ...thresholdLines,
    "",
    "## Decision",
    "",
    `- Go/No-Go: ${data.decision.result}`,
    `- Rationale: ${data.decision.rationale}`,
    `- Follow-ups: ${data.decision.followUps}`
  ].join("\n");
}
