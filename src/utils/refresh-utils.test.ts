import { describe, expect, it } from "@jest/globals";
import {
  isPullFarEnough,
  PULL_MAX_PX,
  PULL_TRIGGER_PX,
  pullDistance,
  shouldRefreshOnTabFocus,
  TAB_REFRESH_MIN_GAP_MS,
} from "./refresh-utils";

describe("pullDistance", () => {
  it("halves the finger's travel so the list resists the pull", () => {
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(2)).toBe(1);
  });

  it("never opens past the maximum, however far the finger goes", () => {
    expect(pullDistance(PULL_MAX_PX * 2)).toBe(PULL_MAX_PX);
    expect(pullDistance(10_000)).toBe(PULL_MAX_PX);
  });

  it("stays shut for an upward or zero drag", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
  });

  it("stays shut for a drag that is not a real number", () => {
    expect(pullDistance(Number.NaN)).toBe(0);
    expect(pullDistance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(pullDistance(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("isPullFarEnough", () => {
  it("refreshes from exactly the trigger distance up", () => {
    expect(isPullFarEnough(PULL_TRIGGER_PX)).toBe(true);
    expect(isPullFarEnough(PULL_MAX_PX)).toBe(true);
  });

  it("ignores a short, accidental pull", () => {
    expect(isPullFarEnough(PULL_TRIGGER_PX - 1)).toBe(false);
    expect(isPullFarEnough(0)).toBe(false);
  });

  it("never triggers on a distance that is not a real number", () => {
    expect(isPullFarEnough(Number.NaN)).toBe(false);
    expect(isPullFarEnough(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("can be reached by a real drag, so the gesture is not impossible", () => {
    expect(isPullFarEnough(pullDistance(PULL_TRIGGER_PX * 2))).toBe(true);
    expect(PULL_TRIGGER_PX).toBeLessThanOrEqual(PULL_MAX_PX);
  });
});

describe("shouldRefreshOnTabFocus", () => {
  const now = 1_000_000;

  it("refreshes the first time a tab is opened", () => {
    expect(shouldRefreshOnTabFocus(null, now)).toBe(true);
  });

  it("skips a tab switch that comes right after the last refresh", () => {
    expect(shouldRefreshOnTabFocus(now, now)).toBe(false);
    expect(shouldRefreshOnTabFocus(now - (TAB_REFRESH_MIN_GAP_MS - 1), now)).toBe(false);
  });

  it("refreshes again once the gap has passed", () => {
    expect(shouldRefreshOnTabFocus(now - TAB_REFRESH_MIN_GAP_MS, now)).toBe(true);
    expect(shouldRefreshOnTabFocus(now - 60_000, now)).toBe(true);
  });

  it("refreshes rather than waits when the clock went backwards", () => {
    expect(shouldRefreshOnTabFocus(now + 5_000, now)).toBe(true);
  });
});
