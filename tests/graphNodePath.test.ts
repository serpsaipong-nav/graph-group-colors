import { describe, expect, it } from "vitest";
import { preNormalizeGraphNodeId } from "../src/utils/graphNodePath";

describe("preNormalizeGraphNodeId", () => {
  it("trims and strips leading ./", () => {
    expect(preNormalizeGraphNodeId("  ./Notes/a.md  ")).toBe("Notes/a.md");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(preNormalizeGraphNodeId("Work\\b.md")).toBe("Work/b.md");
  });

  it("removes leading slashes", () => {
    expect(preNormalizeGraphNodeId("/Inbox/x.md")).toBe("Inbox/x.md");
  });

  it("leaves simple vault-relative paths unchanged", () => {
    expect(preNormalizeGraphNodeId("note.md")).toBe("note.md");
  });
});
