import { describe, expect, it } from "vitest";
import { batchRequest } from "./batch-request";

describe("batch request", () => {
  it("asks for as many hooks as each script must contain", () => {
    const request = batchRequest(3);

    expect(request).toContain("4 hooks (g1 a g4)");
  });
});
