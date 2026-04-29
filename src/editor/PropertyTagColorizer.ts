import type { GroupColor } from "../graph/NodeOverlay";

function rgbIntToHex(rgb: number): string {
  return "#" + (rgb & 0xffffff).toString(16).padStart(6, "0");
}

function contrastColor(rgb: number): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a1a" : "#ffffff";
}

export class PropertyTagColorizer {
  private observer: MutationObserver | null = null;
  private activeContainer: Element | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly getTagColors: (tagId: string) => GroupColor[]) {}

  attach(container: Element): void {
    if (this.activeContainer === container) {
      this.applyColors(container);
      return;
    }
    this.detach();
    this.activeContainer = container;
    this.observer = new MutationObserver(() => this.scheduleRefresh());
    this.observer.observe(container, { childList: true, subtree: true });
    this.applyColors(container);
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.activeContainer) {
      this.clearPills(this.activeContainer);
      this.activeContainer = null;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  refresh(): void {
    if (this.activeContainer) {
      this.applyColors(this.activeContainer);
    }
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh();
    }, 50);
  }

  private applyColors(container: Element): void {
    const pills = container.querySelectorAll<HTMLElement>(".multi-select-pill");
    for (const pill of pills) {
      this.colorizePill(pill);
    }
  }

  private colorizePill(pill: HTMLElement): void {
    const contentEl = pill.querySelector<HTMLElement>(".multi-select-pill-content");
    const rawText = (contentEl ?? pill).textContent?.trim() ?? "";
    if (!rawText) return;

    const tagId = rawText.startsWith("#") ? rawText : `#${rawText}`;
    const colors = this.getTagColors(tagId);

    if (colors.length === 0) {
      this.clearPillStyle(pill, contentEl);
      return;
    }

    const textColor = contrastColor(colors[0].rgb);

    if (colors.length === 1) {
      const hex = rgbIntToHex(colors[0].rgb);
      pill.style.setProperty("background", hex, "important");
      pill.style.setProperty("border-color", hex, "important");
    } else {
      const stops = colors
        .map((c, i) => `${rgbIntToHex(c.rgb)} ${Math.round((i / (colors.length - 1)) * 100)}%`)
        .join(", ");
      pill.style.setProperty("background", `linear-gradient(90deg, ${stops})`, "important");
      pill.style.setProperty("border-color", "transparent", "important");
    }
    // Set color on both the wrapper and the inner content span so Obsidian theme
    // class-level color rules (which target .multi-select-pill-content directly) don't win.
    pill.style.setProperty("color", textColor, "important");
    if (contentEl) {
      contentEl.style.setProperty("color", textColor, "important");
    }
  }

  private clearPills(container: Element): void {
    const pills = container.querySelectorAll<HTMLElement>(".multi-select-pill");
    for (const pill of pills) {
      const contentEl = pill.querySelector<HTMLElement>(".multi-select-pill-content");
      this.clearPillStyle(pill, contentEl);
    }
  }

  private clearPillStyle(pill: HTMLElement, contentEl: HTMLElement | null | undefined): void {
    pill.style.removeProperty("background");
    pill.style.removeProperty("color");
    pill.style.removeProperty("border-color");
    contentEl?.style.removeProperty("color");
  }
}
