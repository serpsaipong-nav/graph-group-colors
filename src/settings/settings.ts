export interface PerfSettings {
  throttleEnabled: boolean;
  throttleInterval: number;
  cullOutsideViewport: boolean;
  overlayCapEnabled: boolean;
  maxVisibleNodes: number;
}

export interface MultiColorSettings {
  killSwitch: boolean;
  maxColorsPerNode: number;
  enableGlobalGraph: boolean;
  enableLocalGraph: boolean;
  perf: PerfSettings;
}

export const DEFAULT_SETTINGS: MultiColorSettings = {
  killSwitch: false,
  maxColorsPerNode: 6,
  enableGlobalGraph: true,
  enableLocalGraph: true,
  perf: {
    throttleEnabled: false,
    throttleInterval: 2,
    cullOutsideViewport: false,
    overlayCapEnabled: false,
    maxVisibleNodes: 2000
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
      )
    }
  };
}
