# M4 Perf Report

## Metadata

- Date: {{date}}
- Branch: {{branch}}
- Commit: {{commit}}
- Environment: {{environment}}
- Runner: {{runner}}
- Notes: {{notes}}

## Workflow

1. Run baseline measurements (`npm run test:perf`) on stock behavior.
2. Run plugin measurements with M4 perf features enabled.
3. Record deltas and document any anomalies or reruns.
4. Mark go/no-go based on acceptance criteria and data confidence.

## Results

### Baseline (stock / control)

- Mean frame time (ms): {{baseline.meanFrameMs}}
- p95 frame time (ms): {{baseline.p95FrameMs}}
- Max frame time (ms): {{baseline.maxFrameMs}}

### M4 candidate

- Mean frame time (ms): {{candidate.meanFrameMs}}
- p95 frame time (ms): {{candidate.p95FrameMs}}
- Max frame time (ms): {{candidate.maxFrameMs}}

### Delta (candidate - baseline)

- Mean frame time delta (ms): {{delta.meanFrameMs}}
- p95 frame time delta (ms): {{delta.p95FrameMs}}
- Max frame time delta (ms): {{delta.maxFrameMs}}

## Acceptance checks

- Invariant: additive rendering unchanged: {{checks.additiveRendering}}
- Invariant: fail-safe and restore: {{checks.failSafeRestore}}
- Invariant: skip path cost near-zero: {{checks.skipPathCost}}

## Decision

- Go/No-Go: {{decision.result}}
- Rationale: {{decision.rationale}}
- Follow-ups: {{decision.followUps}}
