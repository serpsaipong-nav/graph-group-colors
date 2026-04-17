import { normalizeSettings, type MultiColorSettings } from "./settings";

export type SettingsUpdate = Partial<MultiColorSettings>;

export interface SettingsTabCallbacks {
  onChange(nextSettings: MultiColorSettings): void;
}

export class SettingsTab {
  private settings: MultiColorSettings;

  constructor(initialSettings: MultiColorSettings, private readonly callbacks: SettingsTabCallbacks) {
    this.settings = normalizeSettings(initialSettings);
  }

  getSettings(): MultiColorSettings {
    return this.settings;
  }

  update(update: SettingsUpdate): void {
    this.settings = normalizeSettings({
      ...this.settings,
      ...update,
      perf: {
        ...this.settings.perf,
        ...update.perf
      }
    });
    this.callbacks.onChange(this.settings);
  }
}
