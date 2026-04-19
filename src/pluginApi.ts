import type { MCGNRuntime } from "./main";
import type { MultiColorSettings, PartialMultiColorSettings } from "./settings/settings";

/** Minimal surface for settings UI without importing the plugin module. */
export interface GraphGroupColorsPluginApi {
  mergedSettings: MultiColorSettings;
  runtime: MCGNRuntime | null;
  applyPluginSettings(partial: PartialMultiColorSettings): Promise<void>;
}
