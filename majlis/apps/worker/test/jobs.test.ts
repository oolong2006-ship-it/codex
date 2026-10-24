import { describe, expect, it } from "vitest";
import { JOBS, JobRegistry } from "../src/jobs.js";

describe("JobRegistry", () => {
  it("runs a registered handler", async () => {
    const registry = new JobRegistry();
    const seen: unknown[] = [];
    registry.register(JOBS.retentionSweep, async (p) => void seen.push(p));
    await registry.run(JOBS.retentionSweep, { dryRun: true });
    expect(seen).toEqual([{ dryRun: true }]);
  });

  it("refuses duplicate and unknown jobs", async () => {
    const registry = new JobRegistry();
    registry.register(JOBS.analyzeSession, async () => {});
    expect(() => registry.register(JOBS.analyzeSession, async () => {})).toThrow();
    await expect(registry.run(JOBS.updatePersonas, {})).rejects.toThrow();
  });
});
