import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { MCGNRuntime } from "../../src/main";
import { generatePresetFixture, type VaultPresetName } from "../fixtures/large-vault-gen";

type ScenarioId = "A1" | "A2" | "A3" | "B1" | "B2" | "B3";

interface ScenarioDef {
  id: ScenarioId;
  preset: VaultPresetName;
  multiColorRatio: number;
  settings: {
    throttleEnabled: boolean;
    throttleInterval: number;
    cullOutsideViewport: boolean;
  };
  simulationActive: boolean;
}

export interface ScenarioResult {
  scenarioId: ScenarioId;
  nodeCount: number;
  multiColorNodes: number;
  renderedFrames: number;
  elapsedMs: number;
  avgFrameMs: number;
  overlayAdds: number;
  overlayRemoves: number;
}

export interface HarnessResult {
  runtime: "MCGNRuntime";
  frameCount: number;
  scenarios: ScenarioResult[];
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

const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "A1",
    preset: "500",
    multiColorRatio: 0.25,
    settings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "A2",
    preset: "2000",
    multiColorRatio: 0.25,
    settings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "A3",
    preset: "5000",
    multiColorRatio: 0.25,
    settings: { throttleEnabled: false, throttleInterval: 2, cullOutsideViewport: false },
    simulationActive: false
  },
  {
    id: "B1",
    preset: "500",
    multiColorRatio: 0.4,
    settings: { throttleEnabled: true, throttleInterval: 2, cullOutsideViewport: true },
    simulationActive: true
  },
  {
    id: "B2",
    preset: "2000",
    multiColorRatio: 0.4,
    settings: { throttleEnabled: true, throttleInterval: 2, cullOutsideViewport: true },
    simulationActive: true
  },
  {
    id: "B3",
    preset: "5000",
    multiColorRatio: 0.4,
    settings: { throttleEnabled: true, throttleInterval: 2, cullOutsideViewport: true },
    simulationActive: true
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

export function runScenario(scenario: ScenarioDef, frameCount: number): ScenarioResult {
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
  const renderer = {
    nodes,
    renderCallback() {},
    px: {
      stage: {
        addChild() {
          overlayAdds += 1;
        },
        removeChild() {
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

  const runtime = new MCGNRuntime({
    logger: {
      warn() {}
    },
    createGraphics() {
      return new SyntheticGraphics();
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
      return scenario.simulationActive;
    }
  });

  runtime.loadGraphConfig(buildGraphConfig(8));
  runtime.setSettings({
    perf: {
      throttleEnabled: scenario.settings.throttleEnabled,
      throttleInterval: scenario.settings.throttleInterval,
      cullOutsideViewport: scenario.settings.cullOutsideViewport
    }
  });
  runtime.attachView(view);

  const start = performance.now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    renderer.renderCallback();
  }
  const elapsedMs = performance.now() - start;
  runtime.destroy();

  return {
    scenarioId: scenario.id,
    nodeCount: nodes.length,
    multiColorNodes: countMultiColorNodes(fixture.tagsByPath),
    renderedFrames: frameCount,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    avgFrameMs: Number((elapsedMs / frameCount).toFixed(4)),
    overlayAdds,
    overlayRemoves
  };
}

export function runHarness(frameCount = 120): HarnessResult {
  const scenarios: ScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    scenarios.push(runScenario(scenario, frameCount));
  }
  return {
    runtime: "MCGNRuntime",
    frameCount,
    scenarios
  };
}

export async function writeLatestResults(results: HarnessResult): Promise<void> {
  const outputPath = new URL("./results/latest-results.json", import.meta.url);
  await mkdir(new URL("./results", import.meta.url), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
}
