import { afterEach, describe, expect, it, vi } from "vitest";
import { probeGlobalPixiGraphicsDrawMode, readGlobalPixiMajorVersion } from "../src/utils/obsidianInternals";

describe("readGlobalPixiMajorVersion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when PIXI is missing", () => {
    vi.stubGlobal("PIXI", undefined);
    expect(readGlobalPixiMajorVersion()).toBeNull();
  });

  it("parses major from VERSION string", () => {
    vi.stubGlobal("PIXI", { VERSION: "8.4.2" });
    expect(readGlobalPixiMajorVersion()).toBe(8);
    vi.stubGlobal("PIXI", { VERSION: "7.3.1" });
    expect(readGlobalPixiMajorVersion()).toBe(7);
  });
});

describe("probeGlobalPixiGraphicsDrawMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns v8 when VERSION major is at least 8", () => {
    vi.stubGlobal("PIXI", { VERSION: "8.0.0" });
    expect(probeGlobalPixiGraphicsDrawMode()).toBe("v8");
  });

  it("returns legacy when VERSION major is below 8", () => {
    vi.stubGlobal("PIXI", { VERSION: "7.4.0" });
    expect(probeGlobalPixiGraphicsDrawMode()).toBe("legacy");
  });
});
