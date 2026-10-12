import { describe, expect, it } from "@jest/globals";
import { secretsMatch } from "../../../supabase/functions/_shared/secret";

// The check the cron-called Edge Functions (refresh-rivals, sync-local-events) make on the
// x-cron-secret header.
describe("secretsMatch", () => {
  it("accepts the right secret", () => {
    expect(secretsMatch("s3cret-value", "s3cret-value")).toBe(true);
    expect(secretsMatch("clé-secrète-🔑", "clé-secrète-🔑")).toBe(true);
  });

  it("refuses a wrong secret of the same length, wherever the difference is", () => {
    expect(secretsMatch("X3cret-value", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3cret-valuX", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3creT-value", "s3cret-value")).toBe(false);
  });

  it("refuses a secret that is only the start of the right one, or the right one with more after it", () => {
    expect(secretsMatch("s3cret", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3cret-value-and-more", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3cret-value\0", "s3cret-value")).toBe(false);
  });

  it("refuses when the caller sent nothing", () => {
    expect(secretsMatch(null, "s3cret-value")).toBe(false);
    expect(secretsMatch(undefined, "s3cret-value")).toBe(false);
    expect(secretsMatch("", "s3cret-value")).toBe(false);
  });

  it("refuses everyone when no secret is configured, even a caller who also sends nothing", () => {
    expect(secretsMatch("anything", undefined)).toBe(false);
    expect(secretsMatch("anything", "")).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch(null, null)).toBe(false);
    expect(secretsMatch(undefined, undefined)).toBe(false);
  });
});
