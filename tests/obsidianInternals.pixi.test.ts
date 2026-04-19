import { describe, expect, it } from "vitest";
import { ensurePixiDisplayObjectIsOnTop } from "../src/utils/obsidianInternals";

describe("ensurePixiDisplayObjectIsOnTop", () => {
  it("moves child to end of parent.children when not already last", () => {
    const a = { name: "a" };
    const b = { name: "b" };
    const mount = { name: "mount" };
    const children: unknown[] = [mount, a, b];
    const parent = {
      children,
      removeChild(c: unknown) {
        const i = children.indexOf(c);
        if (i >= 0) {
          children.splice(i, 1);
        }
      },
      addChild(c: unknown) {
        children.push(c);
      }
    };
    ensurePixiDisplayObjectIsOnTop(parent, mount);
    expect(children[children.length - 1]).toBe(mount);
  });

  it("does nothing when child is already last", () => {
    const a = {};
    const b = {};
    const children: unknown[] = [a, b];
    const parent = {
      children,
      removeChild() {
        /* no-op for this case */
      },
      addChild() {
        /* no-op */
      }
    };
    ensurePixiDisplayObjectIsOnTop(parent, b);
    expect(children).toEqual([a, b]);
  });
});
