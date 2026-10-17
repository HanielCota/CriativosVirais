import { describe, expect, it } from "vitest";
import { manualSyncOptions } from "./index";

describe("manual metrics sync", () => {
  it("throttles repeated clicks to one job per integration per window", () => {
    // The sync-metrics queue uses the standard policy, where singletonKey alone creates no
    // uniqueness; only singletonKey plus singletonSeconds deduplicates jobs.
    const options = manualSyncOptions("integration-1");
    expect(options.singletonKey).toBe("integration-1");
    expect(options.singletonSeconds).toBeGreaterThanOrEqual(60);
  });
});
