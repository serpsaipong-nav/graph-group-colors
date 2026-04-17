import { describe, it } from "vitest";
import { runHarness, writeLatestResults } from "./harness";

describe("perf harness runner", () => {
  it("writes latest perf matrix results", async () => {
    const results = runHarness();
    await writeLatestResults(results);
  });
});
