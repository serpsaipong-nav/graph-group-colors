import type { CachedMetadata } from "obsidian";
import { describe, expect, it } from "vitest";
import { collectTagsFromCachedMetadata } from "../src/utils/tagsFromMetadata";

describe("collectTagsFromCachedMetadata", () => {
  it("collects inline tags", () => {
    const meta = {
      tags: [{ tag: "#a" }, { tag: "#b" }]
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#a", "#b"]);
  });

  it("reads frontmatter tags array with and without hash", () => {
    const meta = {
      frontmatter: { tags: ["x", "#y"] }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#x", "#y"]);
  });

  it("splits comma-separated frontmatter tags string", () => {
    const meta = {
      frontmatter: { tags: "one, two, three" }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#one", "#two", "#three"]);
  });

  it("splits comma-separated tags when each token already has a hash", () => {
    const meta = {
      frontmatter: { tags: "#a, #b" }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#a", "#b"]);
  });

  it("reads singular frontmatter tag key", () => {
    const meta = {
      frontmatter: { tag: "solo" }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#solo"]);
  });

  it("dedupes overlapping inline and frontmatter tags", () => {
    const meta = {
      tags: [{ tag: "#dup" }],
      frontmatter: { tags: ["dup", "#dup"] }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#dup"]);
  });

  it("includes numeric list entries as string tags", () => {
    const meta = {
      frontmatter: { tags: [2024, "year"] }
    } as CachedMetadata;
    expect(collectTagsFromCachedMetadata(meta)).toEqual(["#2024", "#year"]);
  });
});
