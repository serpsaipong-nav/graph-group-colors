export type VaultPresetName = "500" | "2000" | "5000";

export interface FixtureNode {
  id: string;
  x: number;
  y: number;
  r: number;
  tags: string[];
}

export interface VaultFixture {
  nodes: FixtureNode[];
  tagsByPath: ReadonlyMap<string, readonly string[]>;
}

export interface VaultFixtureOptions {
  nodeCount: number;
  multiColorRatio?: number;
  seed?: number;
  groupCount?: number;
}

const PRESETS: Record<VaultPresetName, number> = {
  "500": 500,
  "2000": 2000,
  "5000": 5000
};

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeGridSize(nodeCount: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
}

export function generateLargeVaultFixture(options: VaultFixtureOptions): VaultFixture {
  const nodeCount = Math.max(1, Math.floor(options.nodeCount));
  const multiColorRatio = clamp01(options.multiColorRatio ?? 0.25);
  const seed = options.seed ?? 1337;
  const groupCount = Math.max(2, Math.floor(options.groupCount ?? 8));
  const rng = createRng(seed);
  const gridSize = computeGridSize(nodeCount);
  const nodes: FixtureNode[] = [];
  const tagsByPath = new Map<string, readonly string[]>();

  const multiColorCount = Math.round(nodeCount * multiColorRatio);

  for (let i = 0; i < nodeCount; i += 1) {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    const id = `notes/note-${String(i).padStart(5, "0")}.md`;
    const radius = 3 + (i % 4);
    const x = col * 24 + Math.floor(rng() * 3);
    const y = row * 24 + Math.floor(rng() * 3);

    const firstGroup = i % groupCount;
    const secondGroup = (i * 7 + 3) % groupCount;
    const thirdGroup = (i * 11 + 5) % groupCount;

    const tags = new Set<string>([`#g${firstGroup}`]);
    if (i < multiColorCount) {
      tags.add(`#g${secondGroup === firstGroup ? (secondGroup + 1) % groupCount : secondGroup}`);
      if (i % 3 === 0) {
        tags.add(`#g${thirdGroup}`);
      }
    }

    const tagList = Array.from(tags);
    nodes.push({ id, x, y, r: radius, tags: tagList });
    tagsByPath.set(id, tagList);
  }

  return { nodes, tagsByPath };
}

export function generatePresetFixture(
  preset: VaultPresetName,
  options: Omit<VaultFixtureOptions, "nodeCount"> = {}
): VaultFixture {
  return generateLargeVaultFixture({
    ...options,
    nodeCount: PRESETS[preset]
  });
}

export const LARGE_VAULT_PRESETS = PRESETS;
