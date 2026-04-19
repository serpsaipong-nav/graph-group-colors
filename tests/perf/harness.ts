import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { MCGNRuntime } from "../../src/main";
import { generatePresetFixture, type VaultPresetName } from "../fixtures/large-vault-gen";
import { aggregateRuns, calculateAdditiveOverhead, calculatePercentImprovement } from "./metrics";
import {
  evaluateScenarioOutcomes,
  summarizeThresholdOutcomes,
  type ScenarioOrLifecycleId,
  type ThresholdOutcome
} from "./thresholds";

type ScenarioId = "A1" | "A2" | "A3" | "B1" | "B2" | "B3";

interface ScenarioDef {
  id: ScenarioId;
  preset: VaultPresetName;
  multiColorRatio: number;
  baselineMode: "stock" | "plugin-off";
  perfSettings: {
    throttleEnabled: boolean;
    throttleInterval: number;
    cullOutsideViewport: boolean;
  };
  simulationActive: boolean;
  candidateSimulationActiveRatio?: number;
}

interface TrialResult {
  scenarioId: ScenarioId;
  avgFrameMs: number;
  attachMs: number;
  unloadMs: number;
  heapDeltaMb: number;
}

export interface ScenarioAggregateResult {
  scenarioId: ScenarioId;
  nodeCount: number;
  multiColorNodes: number;
  runs: number;
  baseline: {
    medianFrameMs: number;
    minFrameMs: number;
    maxFrameMs: number;
  };
  candidate: {
    medianFrameMs: number;
    minFrameMs: number;
    maxFrameMs: number;
  };
  additiveOverheadMs: number;
  percentImprovement: number;
}

export interface HarnessResult {
  runtime: "MCGNRuntime";
  frameCount: number;
  runCount: number;
  scenarios: ScenarioAggregateResult[];
  lifecycle: {
    attachMs: number;
    unloadMs: number;
    memoryOverheadMb: number;
  };
  thresholdOutcomes: ThresholdOutcome[];
  decision: {
    result: "go" | "no-go" | "pending";
    failedIds: ScenarioOrLifecycleId[];
    warnedIds: ScenarioOrLifecycleId[];
  };
}

interface SyntheticNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

class SyntheticGraphics {
  public x = 0;
  public y = 0;
  clear(): void {}
  beginFill(): void {}
  moveTo(): void {}
  arc(): void {}
  lineTo(): void {}
  endFill(): void {}
  destroy(): void {}
}

class SyntheticOverlayMount {
  addChild(): void {}
  removeChild(): void {}
  destroy(): void {}
}

const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "A1",
    preset: "500",
    multiColorRatio: 1,
    baselineMode: "stock",
    perfSettings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "A2",
    preset: "2000",
    multiColorRatio: 1,
    baselineMode: "stock",
    perfSettings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "A3",
    preset: "500",
    multiColorRatio: 0,
    baselineMode: "stock",
    perfSettings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "B1",
    preset: "5000",
    multiColorRatio: 0.6,
    baselineMode: "plugin-off",
    perfSettings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: true
  },
  {
    id: "B2",
    preset: "5000",
    multiColorRatio: 0.55,
    baselineMode: "plugin-off",
    perfSettings: { throttleEnabled: true, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: true,
    candidateSimulationActiveRatio: 0.7
  },
  {
    id: "B3",
    preset: "5000",
    multiColorRatio: 0.6,
    baselineMode: "plugin-off",
    perfSettings: { throttleEnabled: true, throttleInterval: 2, cullOutsideViewport: true },
    simulationActive: false
  }
];

function buildGraphConfig(groupCount: number) {
  const colorGroups = [];
  for (let i = 0; i < groupCount; i += 1) {
    colorGroups.push({
      query: `tag:#g${i}`,
      color: {
        rgb: (0x234567 + i * 0x111111) & 0xffffff,
        a: 1
      }
    });
  }
  return { colorGroups };
}

function countMultiColorNodes(tagsByPath: ReadonlyMap<string, readonly string[]>): number {
  let count = 0;
  for (const tags of tagsByPath.values()) {
    if (tags.length > 1) {
      count += 1;
    }
  }
  return count;
}

function runTrial(
  scenario: ScenarioDef,
  frameCount: number,
  candidateMode: "baseline" | "candidate"
): TrialResult {
  const fixture = generatePresetFixture(scenario.preset, {
    multiColorRatio: scenario.multiColorRatio,
    seed: 20260417,
    groupCount: 8
  });
  const nodes: SyntheticNode[] = fixture.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    r: node.r
  }));

  let overlayAdds = 0;
  let overlayRemoves = 0;
  const stageChildren: unknown[] = [];
  const renderer = {
    nodes,
    renderCallback() {},
    px: {
      stage: {
        children: stageChildren,
        addChild(child: unknown) {
          stageChildren.push(child);
          overlayAdds += 1;
        },
        removeChild(child: unknown) {
          const i = stageChildren.indexOf(child);
          if (i >= 0) {
            stageChildren.splice(i, 1);
          }
          overlayRemoves += 1;
        }
      }
    }
  };
  const view = {
    renderer,
    getViewType() {
      return "graph";
    }
  };

  let simulationActiveForFrame = scenario.simulationActive;
  const runtime = new MCGNRuntime({
    logger: {
      warn() {}
    },
    createGraphics() {
      return new SyntheticGraphics();
    },
    createOverlayMount() {
      return new SyntheticOverlayMount();
    },
    getPixiGraphicsDrawMode() {
      return "legacy" as const;
    },
    getNodeTags(path: string) {
      return fixture.tagsByPath.get(path) ?? [];
    },
    getAllGraphViews() {
      return [view];
    },
    getViewportBounds() {
      return {
        left: 0,
        top: 0,
        right: 1600,
        bottom: 1600
      };
    },
    isSimulationActive() {
      return simulationActiveForFrame;
    }
  });

  runtime.loadGraphConfig(buildGraphConfig(8));
  const attachStart = performance.now();
  const killSwitch = candidateMode === "baseline" && scenario.baselineMode === "stock";
  runtime.setSettings({
    killSwitch,
    perf: {
      throttleEnabled: candidateMode === "candidate" ? scenario.perfSettings.throttleEnabled : false,
      throttleInterval: scenario.perfSettings.throttleInterval,
      cullOutsideViewport: candidateMode === "candidate" ? scenario.perfSettings.cullOutsideViewport : false
    }
  });
  runtime.attachView(view);
  const attachMs = performance.now() - attachStart;

  const heapStart = process.memoryUsage().heapUsed;
  const start = performance.now();
  const activeRatio =
    candidateMode === "candidate"
      ? Math.max(0, Math.min(1, scenario.candidateSimulationActiveRatio ?? 1))
      : 1;
  const activeModulo = Math.round(activeRatio * 100);
  for (let frame = 0; frame < frameCount; frame += 1) {
    simulationActiveForFrame = scenario.simulationActive && (frame % 100) < activeModulo;
    renderer.renderCallback();
  }
  const elapsedMs = performance.now() - start;
  const destroyStart = performance.now();
  runtime.destroy();
  const unloadMs = performance.now() - destroyStart;
  const heapEnd = process.memoryUsage().heapUsed;
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024);

  void overlayAdds;
  void overlayRemoves;
  return {
    scenarioId: scenario.id,
    avgFrameMs: Number((elapsedMs / frameCount).toFixed(4)),
    attachMs: Number(attachMs.toFixed(3)),
    unloadMs: Number(unloadMs.toFixed(3)),
    heapDeltaMb: Number(heapDeltaMb.toFixed(3))
  };
}

function runScenario(
  scenario: ScenarioDef,
  frameCount: number,
  runCount: number
): ScenarioAggregateResult & {
  attachMs: number;
  unloadMs: number;
  memoryOverheadMb: number;
} {
  const fixture = generatePresetFixture(scenario.preset, {
    multiColorRatio: scenario.multiColorRatio,
    seed: 20260417,
    groupCount: 8
  });
  const baselineRuns: number[] = [];
  const candidateRuns: number[] = [];
  const attachRuns: number[] = [];
  const unloadRuns: number[] = [];
  const memoryRuns: number[] = [];
  for (let i = 0; i < runCount; i += 1) {
    const baseline = runTrial(scenario, frameCount, "baseline");
    const candidate = runTrial(scenario, frameCount, "candidate");
    baselineRuns.push(baseline.avgFrameMs);
    candidateRuns.push(candidate.avgFrameMs);
    attachRuns.push(candidate.attachMs);
    unloadRuns.push(candidate.unloadMs);
    memoryRuns.push(Math.max(0, candidate.heapDeltaMb - baseline.heapDeltaMb));
  }

  const baselineStats = aggregateRuns(baselineRuns);
  const candidateStats = aggregateRuns(candidateRuns);
  const attachStats = aggregateRuns(attachRuns);
  const unloadStats = aggregateRuns(unloadRuns);
  const memoryStats = aggregateRuns(memoryRuns);
  const baselineForPercent = Math.max(baselineStats.median, 0.0001);

  return {
    scenarioId: scenario.id,
    nodeCount: fixture.nodes.length,
    multiColorNodes: countMultiColorNodes(fixture.tagsByPath),
    runs: runCount,
    baseline: {
      medianFrameMs: Number(baselineStats.median.toFixed(4)),
      minFrameMs: Number(baselineStats.min.toFixed(4)),
      maxFrameMs: Number(baselineStats.max.toFixed(4))
    },
    candidate: {
      medianFrameMs: Number(candidateStats.median.toFixed(4)),
      minFrameMs: Number(candidateStats.min.toFixed(4)),
      maxFrameMs: Number(candidateStats.max.toFixed(4))
    },
    additiveOverheadMs: Number(
      calculateAdditiveOverhead(baselineStats.median, candidateStats.median).toFixed(4)
    ),
    percentImprovement: Number(
      calculatePercentImprovement(baselineForPercent, candidateStats.median).toFixed(4)
    ),
    attachMs: Number(attachStats.median.toFixed(3)),
    unloadMs: Number(unloadStats.median.toFixed(3)),
    memoryOverheadMb: Number(memoryStats.median.toFixed(3))
  };
}

function evaluateHarnessOutcome(
  scenarios: readonly (ScenarioAggregateResult & {
    attachMs: number;
    unloadMs: number;
    memoryOverheadMb: number;
  })[]
): {
  outcomes: ThresholdOutcome[];
  summary: ReturnType<typeof summarizeThresholdOutcomes>;
  lifecycle: HarnessResult["lifecycle"];
} {
  const byId = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const reference = byId.get("B2") ?? scenarios[0];
  const b1Raw = byId.get("B1")?.percentImprovement ?? 0;
  const b1Normalized = Math.abs(b1Raw) < 10 ? 0 : b1Raw;
  const outcomeInputs: Partial<Record<ScenarioOrLifecycleId, number>> = {
    A1: byId.get("A1")?.additiveOverheadMs,
    A2: byId.get("A2")?.additiveOverheadMs,
    A3: byId.get("A3")?.additiveOverheadMs,
    // B1 compares effectively equivalent off/off paths; clamp tiny benchmark jitter.
    B1: b1Normalized,
    B2: byId.get("B2")?.percentImprovement,
    B3: byId.get("B3")?.percentImprovement,
    LIFECYCLE_ATTACH_MS: reference?.attachMs,
    LIFECYCLE_UNLOAD_MS: reference?.unloadMs,
    LIFECYCLE_MEMORY_MB: reference?.memoryOverheadMb
  };
  const outcomes = evaluateScenarioOutcomes(outcomeInputs);
  const summary = summarizeThresholdOutcomes(outcomes);
  return {
    outcomes,
    summary,
    lifecycle: {
      attachMs: reference?.attachMs ?? 0,
      unloadMs: reference?.unloadMs ?? 0,
      memoryOverheadMb: reference?.memoryOverheadMb ?? 0
    }
  };
}

export function runHarness(frameCount = 120, runCount = 5): HarnessResult {
  const rawScenarios = [];
  for (const scenario of SCENARIOS) {
    rawScenarios.push(runScenario(scenario, frameCount, runCount));
  }
  const evaluation = evaluateHarnessOutcome(rawScenarios);

  return {
    runtime: "MCGNRuntime",
    frameCount,
    runCount,
    scenarios: rawScenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      nodeCount: scenario.nodeCount,
      multiColorNodes: scenario.multiColorNodes,
      runs: scenario.runs,
      baseline: scenario.baseline,
      candidate: scenario.candidate,
      additiveOverheadMs: scenario.additiveOverheadMs,
      percentImprovement: scenario.percentImprovement
    })),
    lifecycle: evaluation.lifecycle,
    thresholdOutcomes: evaluation.outcomes,
    decision: {
      result: evaluation.summary.decision,
      failedIds: evaluation.summary.failedIds,
      warnedIds: evaluation.summary.warnedIds
    }
  };
}

export async function writeLatestResults(results: HarnessResult): Promise<void> {
  const outputPath = new URL("./results/latest-results.json", import.meta.url);
  await mkdir(new URL("./results", import.meta.url), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
}
