# M4 Perf Report

## Metadata

- Date: Not run
- Branch: Not run
- Commit: Not run
- Environment: Not run
- Runner: Not run
- Notes: Not run

## Workflow

1. Run baseline measurements (`npm run test:perf`) on stock behavior.
2. Run plugin measurements with M4 perf features enabled.
3. Record deltas and document any anomalies or reruns.
4. Mark go/no-go based on acceptance criteria and data confidence.

## Results

### Baseline (stock / control)

- Mean frame time (ms): Not run
- p95 frame time (ms): Not run
- Max frame time (ms): Not run

### M4 candidate

- Mean frame time (ms): Not run
- p95 frame time (ms): Not run
- Max frame time (ms): Not run

### Delta (candidate - baseline)

- Mean frame time delta (ms): Not run
- p95 frame time delta (ms): Not run
- Max frame time delta (ms): Not run

## Acceptance checks

- Invariant: additive rendering unchanged: not-run
- Invariant: fail-safe and restore: not-run
- Invariant: skip path cost near-zero: not-run

## Threshold outcomes

- A1: pass (A1 Additive overhead at 500 visible nodes, all multi-color. actual=0.0001ms, target=<= 1ms)
- A2: pass (A2 Additive overhead at 2,000 visible nodes, all multi-color. actual=0.0002ms, target=<= 4ms)
- A3: pass (A3 Additive overhead at 500 nodes, 0% multi-color. actual=0.0001ms, target=<= 0.1ms)
- B1: pass (B1 Perf toggles OFF should not regress active simulation. actual=0%, target=>= 0%)
- B2: fail (B2 Perf toggles ON active simulation improvement target. actual=0%, target=20% to 40%)
- B3: pass (B3 Idle panning should stay within +/-10% of stock. actual=0%, target=-10% to 10%)
- LIFECYCLE_ATTACH_MS: pass (LIFECYCLE_ATTACH_MS Initial attach latency. actual=0.019ms, target=<= 150ms)
- LIFECYCLE_UNLOAD_MS: pass (LIFECYCLE_UNLOAD_MS Unload latency. actual=0.006ms, target=<= 50ms)
- LIFECYCLE_MEMORY_MB: pass (LIFECYCLE_MEMORY_MB Memory overhead at 5,000 nodes. actual=0MB, target=<= 50MB)

## Decision

- Go/No-Go: no-go
- Rationale: Failed: B2
- Follow-ups: None
