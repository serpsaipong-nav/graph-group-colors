# progress.md — Multi-Color Graph Nodes

**Last updated:** 2026-04-17  
**Branch:** `feature/mcgn-core`

## Overall status

- Phase 0 (M0 spike foundation): **pass (code/test level)**
- Phase 1 parallel tracks (A/B/C): **merged into integration branch**
- Integration tests on current branch: **pass**

## Milestone checklist

### M0 — Spike

- [x] Renderer hook patch point established (`renderer.renderCallback`)
- [x] Shape checks and fail-safe path in place
- [x] Error boundary + consecutive-error auto-disable behavior present
- [x] Detach/restore logic implemented
- [ ] Manual Obsidian runtime verification logged (enable/disable visual checks in app)

### M1 — Group resolution

- [x] Group resolver and cache modules implemented
- [x] Ordered matching behavior covered by tests
- [x] Invalid query tolerance covered by tests
- [x] Unit tests passing

### M2 — Overlay rendering

- [x] Multi-slice overlay module implemented
- [x] Skip path for 0/1 color nodes implemented
- [x] Overlay behavior covered by tests

### M3 — Lifecycle integration

- [~] Core hook pieces merged
- [ ] Plugin entry/lifecycle wiring in `main.ts`
- [ ] View open/close integration checks

### M4 — Perf features

- [x] Core perf utility modules present (`Throttle`, `ViewportCull`, `OverlayCap`)
- [x] Unit tests passing for perf modules
- [ ] Full perf harness and acceptance benchmarks

### M5 — Release prep

- [ ] README, manifest polish, release submission

## Notes

- This tracker captures repository progress only.
- Runtime/manual checks in a dev vault should be recorded here once run.
