import { afterEach, describe, expect, it, vi } from "vitest";
import { aiBudgetEnv, privateMethodEnv } from "./env";

describe("AI budget configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to the default when the limit is blank, instead of blocking every AI call", () => {
    vi.stubEnv("AI_MONTHLY_LIMIT_CENTS", " ");
    expect(aiBudgetEnv().AI_MONTHLY_LIMIT_CENTS).toBe(2000);
  });
});

describe("private method configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts base64 wrapped across lines, as the base64 command prints it", () => {
    vi.stubEnv("PRIVATE_METHOD_BASE64", "bWV0\nb2Rv\n");

    expect(privateMethodEnv().PRIVATE_METHOD_BASE64).toBe("bWV0b2Rv");
  });
});
