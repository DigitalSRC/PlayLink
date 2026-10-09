import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";
import { refreshPlayerData, usePullToRefresh, useTabFocusRefresh } from "../../hooks/useRefresh";
import { TAB_REFRESH_MIN_GAP_MS } from "../../utils/refresh-utils";

const mockInvalidate = jest.fn<(filters: { queryKey: unknown[] }) => Promise<void>>();
const mockRefreshRivals = jest.fn<() => Promise<void>>();
let mockSession: { user: { id: string } } | null = null;

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ session: mockSession, refreshRivals: mockRefreshRivals }),
}));

const client = { invalidateQueries: mockInvalidate } as unknown as QueryClient;
const invalidatedKeys = () => mockInvalidate.mock.calls.map(([f]) => f.queryKey);

describe("refreshPlayerData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
  });

  it("marks the groups, open groups, rounds, profile, and starter rewards out of date", async () => {
    await refreshPlayerData(client, "me");

    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([["groups"], ["group"], ["group-results"], ["profile", "me"], ["starter-rewards", "me"]])
    );
    expect(mockInvalidate).toHaveBeenCalledTimes(5);
  });

  it("refreshes only the group data when nobody is signed in", async () => {
    await refreshPlayerData(client, undefined);

    expect(invalidatedKeys()).toEqual([["groups"], ["group"], ["group-results"]]);
  });

  it("does not reject when one of the refetches fails", async () => {
    mockInvalidate.mockRejectedValueOnce(new Error("offline"));
    await expect(refreshPlayerData(client, "me")).resolves.toBeUndefined();
    expect(mockInvalidate).toHaveBeenCalledTimes(5);
  });
});

describe("usePullToRefresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { user: { id: "me" } };
    mockInvalidate.mockResolvedValue(undefined);
    mockRefreshRivals.mockResolvedValue(undefined);
  });

  it("reloads the shared data, the rivals, and the screen's own data, showing the spinner meanwhile", async () => {
    let finishExtra!: () => void;
    const extra = jest.fn(() => new Promise<void>((resolve) => { finishExtra = resolve; }));
    const { result } = await renderHook(() => usePullToRefresh(extra));
    expect(result.current.refreshing).toBe(false);

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(true);
    expect(extra).toHaveBeenCalledTimes(1);
    expect(mockRefreshRivals).toHaveBeenCalledTimes(1);
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([["groups"], ["profile", "me"]]));

    await act(async () => {
      finishExtra();
      await done;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it("ignores a second pull while the first is still running", async () => {
    let finishExtra!: () => void;
    const extra = jest.fn(() => new Promise<void>((resolve) => { finishExtra = resolve; }));
    const { result } = await renderHook(() => usePullToRefresh(extra));

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.onRefresh();
    });
    await act(async () => {
      await result.current.onRefresh();
    });
    expect(extra).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishExtra();
      await first;
    });
  });

  it("ends the spinner even when the screen's own reload fails", async () => {
    const extra = jest.fn(() => Promise.reject(new Error("offline")));
    const { result } = await renderHook(() => usePullToRefresh(extra));

    await act(async () => {
      await result.current.onRefresh();
    });
    expect(result.current.refreshing).toBe(false);
  });

  it("works without a screen-specific reload", async () => {
    const { result } = await renderHook(() => usePullToRefresh());

    await act(async () => {
      await result.current.onRefresh();
    });
    expect(mockRefreshRivals).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });
});

describe("useTabFocusRefresh", () => {
  let now = 1_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { user: { id: "me" } };
    mockInvalidate.mockResolvedValue(undefined);
    mockRefreshRivals.mockResolvedValue(undefined);
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refreshes the data and rivals when a tab opens", async () => {
    const { result } = await renderHook(() => useTabFocusRefresh());
    await act(async () => result.current());

    expect(mockRefreshRivals).toHaveBeenCalledTimes(1);
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([["groups"], ["profile", "me"]]));
  });

  it("skips tab switches that come within a few seconds of the last refresh", async () => {
    const { result } = await renderHook(() => useTabFocusRefresh());
    await act(async () => result.current());
    now += TAB_REFRESH_MIN_GAP_MS - 1;
    await act(async () => result.current());

    expect(mockRefreshRivals).toHaveBeenCalledTimes(1);
  });

  it("refreshes again once the gap has passed", async () => {
    const { result } = await renderHook(() => useTabFocusRefresh());
    await act(async () => result.current());
    now += TAB_REFRESH_MIN_GAP_MS;
    await act(async () => result.current());

    expect(mockRefreshRivals).toHaveBeenCalledTimes(2);
  });
});
