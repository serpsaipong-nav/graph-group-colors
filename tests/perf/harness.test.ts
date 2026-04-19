import { describe, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { runHarness, writeLatestResults } from "./harness";
import { renderPerfReport } from "./report";

describe("perf harness runner", () => {
  it(
    "writes latest perf matrix results",
    async () => {
    const results = runHarness();
    await writeLatestResults(results);
    const report = renderPerfReport({
      thresholdOutcomes: results.thresholdOutcomes,
      decision: {
        result: results.decision.result,
        rationale:
          results.decision.failedIds.length > 0
            ? `Failed: ${results.decision.failedIds.join(", ")}`
            : "All thresholds pass.",
        followUps:
          results.decision.warnedIds.length > 0
            ? `Warnings: ${results.decision.warnedIds.join(", ")}`
            : "None"
      }
    });
    await mkdir(new URL("./results", import.meta.url), { recursive: true });
    await writeFile(new URL("./results/latest-report.md", import.meta.url), `${report}\n`, "utf8");
    },
    15_000
  );
});
