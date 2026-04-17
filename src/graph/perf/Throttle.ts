export interface ThrottleOptions {
  interval: number;
  enabled: boolean;
}

export class FrameThrottle {
  private frame = 0;
  private interval = 1;
  private enabled = false;

  constructor(options: ThrottleOptions) {
    this.configure(options);
  }

  configure(options: ThrottleOptions): void {
    this.enabled = options.enabled;
    this.interval = Math.max(1, Math.floor(options.interval));
  }

  shouldDraw(simulationActive: boolean): boolean {
    if (!this.enabled || !simulationActive) {
      return true;
    }
    this.frame += 1;
    return this.frame % this.interval === 0;
  }

  shouldDrawThisFrame(): boolean {
    return this.shouldDraw(true);
  }

  reset(): void {
    this.frame = 0;
  }
}
