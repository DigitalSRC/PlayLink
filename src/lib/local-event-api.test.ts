import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchLocalEvents } from "./local-event-api";

type QueryResult = { data: unknown; error: unknown };

// A stand-in for the Supabase query builder: every chained call returns the same object, and
// awaiting it resolves to whatever `mockResult` currently holds.
let mockResult: QueryResult = { data: [], error: null };
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIlike = jest.fn();

jest.mock("./supabase", () => {
  const builder: Record<string, unknown> = {};
  builder.select = (...args: unknown[]) => {
    mockSelect(...args);
    return builder;
  };
  builder.eq = (...args: unknown[]) => {
    mockEq(...args);
    return builder;
  };
  builder.ilike = (...args: unknown[]) => {
    mockIlike(...args);
    return builder;
  };
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(mockResult);
  return {
    supabase: {
      from: (...args: unknown[]) => {
        mockFrom(...args);
        return builder;
      },
    },
  };
});

const weeklyRow = {
  id: "event-1",
  area: "reno-sparks",
  venue_name: "Test Game Store",
  address: "123 Example St, Reno, NV",
  game_type: "mtg",
  format: "Commander",
  day_of_week: 3,
  event_date: null,
  start_time: "18:00:00",
  end_time: "22:00:00",
  notes: "Casual pods",
};

describe("local-event-api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResult = { data: [], error: null };
  });

  it("queries local_events for the given area", async () => {
    await fetchLocalEvents("reno-sparks");

    expect(mockFrom).toHaveBeenCalledWith("local_events");
    expect(mockEq).toHaveBeenCalledWith("area", "reno-sparks");
  });

  it("only filters by format when one is given", async () => {
    await fetchLocalEvents("reno-sparks");
    expect(mockIlike).not.toHaveBeenCalled();

    await fetchLocalEvents("reno-sparks", "Commander");
    expect(mockIlike).toHaveBeenCalledWith("format", "Commander");
  });

  it("maps a weekly snake_case row into a camelCase LocalEvent", async () => {
    mockResult = { data: [weeklyRow], error: null };

    expect(await fetchLocalEvents("reno-sparks")).toEqual([
      {
        id: "event-1",
        area: "reno-sparks",
        venueName: "Test Game Store",
        address: "123 Example St, Reno, NV",
        gameType: "mtg",
        format: "Commander",
        dayOfWeek: 3,
        eventDate: undefined,
        startTime: "18:00:00",
        endTime: "22:00:00",
        notes: "Casual pods",
      },
    ]);
  });

  it("maps a one-off row, turning null columns into undefined", async () => {
    mockResult = {
      data: [{ ...weeklyRow, day_of_week: null, event_date: "2026-10-10", end_time: null }],
      error: null,
    };

    const [event] = await fetchLocalEvents("reno-sparks");
    expect(event.dayOfWeek).toBeUndefined();
    expect(event.eventDate).toBe("2026-10-10");
    expect(event.endTime).toBeUndefined();
  });

  it("keeps Sunday (day_of_week 0) rather than treating it as missing", async () => {
    mockResult = { data: [{ ...weeklyRow, day_of_week: 0 }], error: null };

    const [event] = await fetchLocalEvents("reno-sparks");
    expect(event.dayOfWeek).toBe(0);
  });

  it("returns an empty array when the area has no events", async () => {
    expect(await fetchLocalEvents("nowhere")).toEqual([]);
  });

  it("throws the Supabase error instead of returning partial data", async () => {
    const error = { message: 'relation "public.local_events" does not exist' };
    mockResult = { data: null, error };

    await expect(fetchLocalEvents("reno-sparks")).rejects.toBe(error);
  });
});
