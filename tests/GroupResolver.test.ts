import { describe, expect, it } from "vitest";
import { ColorCache } from "../src/graph/ColorCache";
import { GroupResolver } from "../src/graph/GroupResolver";

describe("GroupResolver", () => {
  it("matches groups in configured order", () => {
    const resolver = new GroupResolver({ maxColorsPerNode: 6 });
    resolver.loadGroups({
      colorGroups: [
        { query: "tag:#databricks", color: { rgb: 0x3366ff, a: 1 } },
        { query: "tag:#medium", color: { rgb: 0xff8800, a: 0.8 } }
      ]
    });

    const matches = resolver.resolveForFile("notes/sql.md", ["#medium", "#databricks"]);
    expect(matches.map((m) => m.query)).toEqual(["tag:#databricks", "tag:#medium"]);
    expect(matches.map((m) => m.rgb)).toEqual([0x3366ff, 0xff8800]);
  });

  it("supports path and negated filters", () => {
    const resolver = new GroupResolver({ maxColorsPerNode: 6 });
    resolver.loadGroups({
      colorGroups: [
        { query: "path:\"work/\" -tag:#private", color: { rgb: 0x00cc66, a: 1 } },
        { query: "path:\"work/\" tag:#private", color: { rgb: 0xcc0066, a: 1 } }
      ]
    });

    const publicNote = resolver.resolveForFile("work/plan.md", ["#project"]);
    expect(publicNote).toHaveLength(1);
    expect(publicNote[0].rgb).toBe(0x00cc66);

    const privateNote = resolver.resolveForFile("work/private.md", ["#private"]);
    expect(privateNote).toHaveLength(1);
    expect(privateNote[0].rgb).toBe(0xcc0066);
  });

  it("caps the number of resolved colors", () => {
    const resolver = new GroupResolver({ maxColorsPerNode: 2 });
    resolver.loadGroups({
      colorGroups: [
        { query: "tag:#a", color: { rgb: 1 } },
        { query: "tag:#b", color: { rgb: 2 } },
        { query: "tag:#c", color: { rgb: 3 } }
      ]
    });

    const matches = resolver.resolveForFile("n.md", ["#a", "#b", "#c"]);
    expect(matches.map((m) => m.rgb)).toEqual([1, 2]);
  });
});

describe("ColorCache", () => {
  it("caches, invalidates, and renames entries", () => {
    const cache = new ColorCache();
    cache.set("old.md", [{ rgb: 1, alpha: 1, query: "tag:#a" }]);
    expect(cache.get("old.md")).toEqual([{ rgb: 1, alpha: 1, query: "tag:#a" }]);

    cache.handleRename("old.md", "new.md");
    expect(cache.get("old.md")).toBeNull();
    expect(cache.get("new.md")).toEqual([{ rgb: 1, alpha: 1, query: "tag:#a" }]);

    cache.invalidatePath("new.md");
    expect(cache.get("new.md")).toBeNull();
    expect(cache.size()).toBe(0);
  });
});
