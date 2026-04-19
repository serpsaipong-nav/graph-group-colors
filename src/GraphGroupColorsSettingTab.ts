import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { GraphGroupColorsPluginApi } from "./pluginApi";
import { currentScope, type OverlayScope } from "./obsidianPlugin";

export class GraphGroupColorsSettingTab extends PluginSettingTab {
  private readonly api: Plugin & GraphGroupColorsPluginApi;

  constructor(app: App, plugin: Plugin & GraphGroupColorsPluginApi) {
    super(app, plugin);
    this.api = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Graph group colors" });

    new Setting(containerEl)
      .setName("Apply overlays to")
      .setDesc(
        "Choose which graph views get multi-color overlays. Command palette: \"Toggle scope\" cycles through these."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("both", "Both (global + local)")
          .addOption("global", "Global graph only")
          .addOption("local", "Local graph only")
          .setValue(currentScope(this.api.mergedSettings))
          .onChange(async (value) => {
            const scope = value as OverlayScope;
            await this.api.applyPluginSettings({
              enableGlobalGraph: scope !== "local",
              enableLocalGraph: scope !== "global"
            });
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Debug multi-color stats")
      .setDesc(
        "Logs every 5 seconds how many visible graph nodes matched 2+ color groups (see developer console). Use to verify group resolution."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.api.mergedSettings.perf.debugLogMultiColorStats).onChange(async (value) => {
          await this.api.applyPluginSettings({
            perf: { debugLogMultiColorStats: value }
          });
          this.display();
        })
      );
  }
}
