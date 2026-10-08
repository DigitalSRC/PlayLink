import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ReactNode } from "react";
import { localEventKeys, usePreloadCalendar } from "../../hooks/useLocalEventQueries";

const mockResolveEventArea = jest.fn<(location: string, refresh?: boolean) => Promise<unknown>>();
const mockFetchLocalEvents = jest.fn<(area: string, format?: string) => Promise<unknown>>();

jest.mock("../../lib/event-area-api", () => ({
  resolveEventArea: (location: string, refresh?: boolean) => mockResolveEventArea(location, refresh),
}));
jest.mock("../../lib/local-event-api", () => ({
  fetchLocalEvents: (area: string, format?: string) => mockFetchLocalEvents(area, format),
}));

const resolution = { area: { id: "reno-nv", label: "Reno, NV" }, synced: false, lastSyncedAt: null, syncError: null };
const events = [{ id: "e1", venueName: "Game Store" }];

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // Lets every request the hook started finish, and its result render, before a test ends.
  const settle = () => waitFor(() => expect(client.isFetching()).toBe(0));
  return { client, wrapper, settle };
};

describe("usePreloadCalendar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveEventArea.mockResolvedValue(resolution);
    mockFetchLocalEvents.mockResolvedValue(events);
  });

  it("looks up the player's area and then loads that area's events, with no screen open", async () => {
    const { wrapper, settle } = setup();

    await renderHook(() => usePreloadCalendar("  Reno, NV "), { wrapper });

    await waitFor(() => expect(mockFetchLocalEvents).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockResolveEventArea).toHaveBeenCalledTimes(1);
    expect(mockResolveEventArea.mock.calls[0][0]).toBe("Reno, NV");
    expect(mockFetchLocalEvents.mock.calls[0][0]).toBe("reno-nv");
  });

  it("leaves the answers in the cache under the keys the Calendar reads", async () => {
    const { client, wrapper } = setup();

    await renderHook(() => usePreloadCalendar("Reno, NV"), { wrapper });

    await waitFor(() => expect(client.getQueryData(localEventKeys.list("reno-nv"))).toEqual(events));
    expect(client.getQueryData(localEventKeys.area("Reno, NV"))).toEqual(resolution);
  });

  it("does not force a refresh of the area's events", async () => {
    const { wrapper, settle } = setup();

    await renderHook(() => usePreloadCalendar("Reno, NV"), { wrapper });

    await waitFor(() => expect(mockFetchLocalEvents).toHaveBeenCalled());
    await settle();
    expect(mockResolveEventArea.mock.calls[0][1]).not.toBe(true);
  });

  it.each([undefined, null, "", "   ", "Nearby"])("asks for nothing when the location is %p", async (saved) => {
    const { wrapper } = setup();

    await renderHook(() => usePreloadCalendar(saved), { wrapper });
    await Promise.resolve();

    expect(mockResolveEventArea).not.toHaveBeenCalled();
    expect(mockFetchLocalEvents).not.toHaveBeenCalled();
  });

  it("does not load events, or throw, when the area can't be found", async () => {
    mockResolveEventArea.mockRejectedValue(Object.assign(new Error("not found"), { code: "location_not_found" }));
    const { wrapper, settle } = setup();

    await renderHook(() => usePreloadCalendar("Atlantis"), { wrapper });

    await waitFor(() => expect(mockResolveEventArea).toHaveBeenCalledTimes(1));
    await settle();
    expect(mockFetchLocalEvents).not.toHaveBeenCalled();
  });

  it("makes no second request when the data is already cached", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(localEventKeys.area("Reno, NV"), resolution);
    client.setQueryData(localEventKeys.list("reno-nv"), events);
    client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });

    await renderHook(() => usePreloadCalendar("Reno, NV"), { wrapper });
    await Promise.resolve();

    expect(mockResolveEventArea).not.toHaveBeenCalled();
    expect(mockFetchLocalEvents).not.toHaveBeenCalled();
  });
});
