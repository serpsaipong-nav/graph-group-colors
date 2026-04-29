export interface PerfSettings {
  throttleEnabled: boolean;
  throttleInterval: number;
  cullOutsideViewport: boolean;
  overlayCapEnabled: boolean;
  maxVisibleNodes: number;
  /** When true, logs rate-limited multi-color resolution stats to the developer console. */
  debugLogMultiColorStats: boolean;
}

export interface MultiColorSettings {
  killSwitch: boolean;
  maxColorsPerNode: number;
  enableGlobalGraph: boolean;
  enableLocalGraph: boolean;
  enableTagNodeColors: boolean;
  enablePropertyTagColors: boolean;
  perf: PerfSettings;
}

/** Partial update shape for settings — `perf` may be a partial object so callers can flip one flag. */
export type PartialMultiColorSettings = Partial<Omit<MultiColorSettings, "perf">> & {
  perf?: Partial<PerfSettings>;
};

export const DEFAULT_SETTINGS: MultiColorSettings = {
  killSwitch: false,
  maxColorsPerNode: 6,
  enableGlobalGraph: true,
  enableLocalGraph: true,
  enableTagNodeColors: true,
  enablePropertyTagColors: true,
    perf: {
      throttleEnabled: false,
      throttleInterval: 2,
      cullOutsideViewport: false,
      overlayCapEnabled: false,
      maxVisibleNodes: 2000,
      debugLogMultiColorStats: false
    }
};

function normalizePositiveInt(value: number, fallback: number, minValue: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minValue, Math.floor(value));
}

export function normalizeSettings(input: Partial<MultiColorSettings> | null | undefined): MultiColorSettings {
  const perfInput = input?.perf;
  return {
    killSwitch: Boolean(input?.killSwitch),
    maxColorsPerNode: normalizePositiveInt(
      input?.maxColorsPerNode ?? DEFAULT_SETTINGS.maxColorsPerNode,
      DEFAULT_SETTINGS.maxColorsPerNode,
      2
    ),
    enableGlobalGraph: input?.enableGlobalGraph ?? DEFAULT_SETTINGS.enableGlobalGraph,
    enableLocalGraph: input?.enableLocalGraph ?? DEFAULT_SETTINGS.enableLocalGraph,
    enableTagNodeColors: input?.enableTagNodeColors ?? DEFAULT_SETTINGS.enableTagNodeColors,
    enablePropertyTagColors: input?.enablePropertyTagColors ?? DEFAULT_SETTINGS.enablePropertyTagColors,
    perf: {
      throttleEnabled: perfInput?.throttleEnabled ?? DEFAULT_SETTINGS.perf.throttleEnabled,
      throttleInterval: normalizePositiveInt(
        perfInput?.throttleInterval ?? DEFAULT_SETTINGS.perf.throttleInterval,
        DEFAULT_SETTINGS.perf.throttleInterval,
        1
      ),
      cullOutsideViewport: perfInput?.cullOutsideViewport ?? DEFAULT_SETTINGS.perf.cullOutsideViewport,
      overlayCapEnabled: perfInput?.overlayCapEnabled ?? DEFAULT_SETTINGS.perf.overlayCapEnabled,
      maxVisibleNodes: normalizePositiveInt(
        perfInput?.maxVisibleNodes ?? DEFAULT_SETTINGS.perf.maxVisibleNodes,
        DEFAULT_SETTINGS.perf.maxVisibleNodes,
        1
      ),
      debugLogMultiColorStats: Boolean(
        perfInput?.debugLogMultiColorStats ?? DEFAULT_SETTINGS.perf.debugLogMultiColorStats
      )
    }
  };
}
