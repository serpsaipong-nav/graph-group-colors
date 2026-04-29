import { MarkdownView, normalizePath, Notice, Plugin, TFile } from "obsidian";
import { GraphGroupColorsSettingTab } from "./GraphGroupColorsSettingTab";
import { PropertyTagColorizer } from "./editor/PropertyTagColorizer";
import type { GraphConfig } from "./graph/GroupResolver";
import { MCGNRuntime } from "./main";
import type { GraphGroupColorsPluginApi } from "./pluginApi";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type MultiColorSettings,
  type PartialMultiColorSettings
} from "./settings/settings";
import { preNormalizeGraphNodeId } from "./utils/graphNodePath";
import { collectTagsFromCachedMetadata } from "./utils/tagsFromMetadata";
import {
  probeGlobalPixiGraphicsDrawMode,
  readSimulationActiveFromRenderer,
  tryCreateGlobalPixiGraphics
} from "./utils/obsidianInternals";

export default class GraphGroupColorsPlugin extends Plugin implements GraphGroupColorsPluginApi {
  runtime: MCGNRuntime | null = null;
  mergedSettings: MultiColorSettings = DEFAULT_SETTINGS;
  private graphReloadTimer: ReturnType<typeof setTimeout> | null = null;
  /** Single-flight guard for async graph runtime startup. */
  private runtimeLaunch: Promise<void> | null = null;
  /** Log once if we are waiting for PIXI (loads with Graph view). */
  private loggedPixiDeferred = false;
  private tagColorizer: PropertyTagColorizer | null = null;

  async onload(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<MultiColorSettings> | null | undefined;
    this.mergedSettings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...loaded,
      perf: {
        ...DEFAULT_SETTINGS.perf,
        ...loaded?.perf
      }
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        void this.onWorkspaceLayoutChange();
      })
    );

    this.tagColorizer = new PropertyTagColorizer((tagId) => this.runtime?.resolveTagColors(tagId) ?? []);

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.refreshPropertyColorizer();
      })
    );

    await this.ensureGraphRuntime();
    this.addSettingTab(new GraphGroupColorsSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-global-graph",
      name: "Toggle multi-color overlays: Global graph",
      callback: () => {
        void this.toggleGlobalGraph();
      }
    });

    this.addCommand({
      id: "toggle-local-graph",
      name: "Toggle multi-color overlays: Local graph",
      callback: () => {
        void this.toggleLocalGraph();
      }
    });

    this.addCommand({
      id: "cycle-scope",
      name: "Cycle overlay scope (Both → Global only → Local only)",
      callback: () => {
        void this.cycleScope();
      }
    });
  }

  private async toggleGlobalGraph(): Promise<void> {
    const next = !this.mergedSettings.enableGlobalGraph;
    await this.applyPluginSettings({ enableGlobalGraph: next });
    new Notice(`[MCGN] Global graph overlays: ${next ? "on" : "off"}`);
  }

  private async toggleLocalGraph(): Promise<void> {
    const next = !this.mergedSettings.enableLocalGraph;
    await this.applyPluginSettings({ enableLocalGraph: next });
    new Notice(`[MCGN] Local graph overlays: ${next ? "on" : "off"}`);
  }

  private async cycleScope(): Promise<void> {
    const next = nextScope(currentScope(this.mergedSettings));
    await this.applyPluginSettings({
      enableGlobalGraph: next !== "local",
      enableLocalGraph: next !== "global"
    });
    new Notice(`[MCGN] Overlay scope: ${scopeLabel(next)}`);
  }

  private async onWorkspaceLayoutChange(): Promise<void> {
    try {
      if (this.runtime) {
        this.runtime.refreshAttachedViews();
        return;
      }
      await this.ensureGraphRuntime();
    } catch (error) {
      console.warn("[MCGN] layout-change handler failed; will retry on next layout event.", error);
    }
  }

  /**
   * Obsidian often exposes `globalThis.PIXI` only after Graph view has loaded WebGL/PIXI once.
   * Retry on `layout-change` until PIXI and `graph.json` are available.
   */
  private async ensureGraphRuntime(): Promise<void> {
    if (this.runtime) {
      return;
    }
    if (this.runtimeLaunch) {
      await this.runtimeLaunch;
      return;
    }
    this.runtimeLaunch = this.launchGraphRuntime();
    try {
      await this.runtimeLaunch;
    } finally {
      this.runtimeLaunch = null;
    }
  }

  async applyPluginSettings(partial: PartialMultiColorSettings): Promise<void> {
    this.mergedSettings = normalizeSettings({
      ...this.mergedSettings,
      ...partial,
      perf: {
        ...this.mergedSettings.perf,
        ...partial.perf
      }
    });
    await this.saveData(this.mergedSettings);
    this.runtime?.setSettings(this.mergedSettings);
    this.runtime?.refreshAttachedViews();
    this.runtime?.forceRenderAttachedViews();
    this.refreshPropertyColorizer();
  }

  onunload(): void {
    if (this.graphReloadTimer !== null) {
      clearTimeout(this.graphReloadTimer);
      this.graphReloadTimer = null;
    }
    this.tagColorizer?.detach();
    this.tagColorizer = null;
    this.runtime?.destroy();
    this.runtime = null;
  }

  private graphConfigPath(): string {
    return normalizePath(`${this.app.vault.configDir}/graph.json`);
  }

  private normalizeVaultPathForGraph(path: string): string {
    return normalizePath(preNormalizeGraphNodeId(path));
  }

  private async launchGraphRuntime(): Promise<void> {
    const probe = tryCreateGlobalPixiGraphics();
    if (!probe) {
      if (!this.loggedPixiDeferred) {
        this.loggedPixiDeferred = true;
        console.info(
          "[MCGN] PIXI not loaded yet — open Graph view once, then reload the plugin or switch tabs so overlays can attach."
        );
      }
      return;
    }
    probe.destroy();

    const graphConfig = await this.readGraphConfig();
    if (!graphConfig) {
      console.warn(
        `[MCGN] Could not read color groups from ${this.graphConfigPath()}. Ensure Graph settings → Groups exist (creates graph.json).`
      );
      return;
    }

    const runtime = new MCGNRuntime({
      logger: {
        warn(message: string, error?: unknown): void {
          if (error !== undefined) {
            console.warn(message, error);
          } else {
            console.warn(message);
          }
        }
      },
      createGraphics: () => {
        const graphic = tryCreateGlobalPixiGraphics();
        if (!graphic) {
          throw new Error("[MCGN] PIXI.Graphics became unavailable.");
        }
        return graphic;
      },
      getPixiGraphicsDrawMode: () => probeGlobalPixiGraphicsDrawMode(),
      normalizeNodePath: (id: string) => normalizePath(preNormalizeGraphNodeId(id)),
      getNodeTags: (path: string) => this.collectTagsForPath(path),
      getAllGraphViews: () => this.collectOpenGraphViews(),
      isSimulationActive: (renderer) => readSimulationActiveFromRenderer(renderer)
    });

    runtime.loadGraphConfig(graphConfig);
    runtime.setSettings(this.mergedSettings);
    this.runtime = runtime;

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file instanceof TFile) {
          this.runtime?.onMetadataChanged(this.normalizeVaultPathForGraph(file.path));
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          this.runtime?.onFileRename(
            this.normalizeVaultPathForGraph(oldPath),
            this.normalizeVaultPathForGraph(file.path)
          );
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.runtime?.onFileDelete(this.normalizeVaultPathForGraph(file.path));
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.runtime?.onFileCreate(this.normalizeVaultPathForGraph(file.path));
        }
      })
    );

    const graphPath = this.graphConfigPath();
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.path === graphPath) {
          this.scheduleGraphConfigReload();
        }
      })
    );

    runtime.attachToOpenViews();
    console.info(
      "[MCGN] Active: multi-color overlays on Graph / Local graph when a note matches 2+ color groups (see Graph settings → Groups)."
    );
  }

  private scheduleGraphConfigReload(): void {
    if (this.graphReloadTimer !== null) {
      clearTimeout(this.graphReloadTimer);
    }
    this.graphReloadTimer = setTimeout(() => {
      this.graphReloadTimer = null;
      void this.reloadGraphConfig();
    }, 150);
  }

  private async reloadGraphConfig(): Promise<void> {
    if (!this.runtime) {
      return;
    }
    const next = await this.readGraphConfig();
    if (!next) {
      console.warn("[MCGN] graph.json reload failed; keeping previous groups.");
      return;
    }
    this.runtime.loadGraphConfig(next);
    this.runtime.refreshAttachedViews();
    this.tagColorizer?.refresh();
  }

  private async readGraphConfig(): Promise<GraphConfig | null> {
    const path = this.graphConfigPath();
    try {
      const raw = await this.app.vault.adapter.read(path);
      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed)) {
        return null;
      }
      const colorGroups = parsed.colorGroups;
      if (colorGroups !== undefined && !Array.isArray(colorGroups)) {
        return null;
      }
      return { colorGroups } as GraphConfig;
    } catch {
      return null;
    }
  }

  private collectOpenGraphViews(): unknown[] {
    const graphLeaves = this.app.workspace.getLeavesOfType("graph");
    const localLeaves = this.app.workspace.getLeavesOfType("localgraph");
    const views: unknown[] = [];
    for (const leaf of [...graphLeaves, ...localLeaves]) {
      // Skip deferred leaves (Obsidian 1.7+): `leaf.view` exists but has no renderer
      // until the tab is first activated. Re-emits `layout-change` when loaded.
      if ((leaf as unknown as { isDeferred?: boolean }).isDeferred) {
        continue;
      }
      views.push(leaf.view);
    }
    return views;
  }

  private refreshPropertyColorizer(): void {
    if (!this.tagColorizer || !this.mergedSettings.enablePropertyTagColors) {
      this.tagColorizer?.detach();
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      this.tagColorizer.detach();
      return;
    }
    const container =
      activeView.contentEl.querySelector(".metadata-content") ??
      activeView.contentEl.querySelector(".metadata-properties") ??
      activeView.contentEl;
    this.tagColorizer.attach(container);
  }

  private collectTagsForPath(path: string): readonly string[] {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return [];
    }
    const meta = this.app.metadataCache.getFileCache(file);
    return collectTagsFromCachedMetadata(meta);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type OverlayScope = "both" | "global" | "local";

export function currentScope(settings: MultiColorSettings): OverlayScope {
  if (settings.enableGlobalGraph && settings.enableLocalGraph) return "both";
  if (settings.enableGlobalGraph) return "global";
  if (settings.enableLocalGraph) return "local";
  return "both";
}

export function nextScope(scope: OverlayScope): OverlayScope {
  if (scope === "both") return "global";
  if (scope === "global") return "local";
  return "both";
}

export function scopeLabel(scope: OverlayScope): string {
  if (scope === "global") return "Global graph only";
  if (scope === "local") return "Local graph only";
  return "Both (global + local)";
}
