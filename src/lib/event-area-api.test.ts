import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EventAreaError, resolveEventArea } from "./event-area-api";

type InvokeResult = { data: unknown; error: unknown };

let mockInvokeResult: InvokeResult = { data: null, error: null };
const mockInvoke = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => {
        mockInvoke(...args);
        return Promise.resolve(mockInvokeResult);
      },
    },
  },
}));

const okBody = {
  area: { id: "reno-sparks", label: "Reno-Sparks, NV" },
  synced: true,
  lastSyncedAt: "2026-10-07T09:23:48.667Z",
  syncError: null,
};

/** Mimics the error supabase-js returns for a non-2xx function reply. */
const httpError = (body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { json: () => Promise.resolve(body) },
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(EventAreaError);
    return (error as EventAreaError).code;
  }
  throw new Error("expected a rejection");
};

describe("event-area-api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvokeResult = { data: okBody, error: null };
  });

  it("calls resolve-area with the location, not refreshing by default", async () => {
    await resolveEventArea("Reno, NV");

    expect(mockInvoke).toHaveBeenCalledWith("resolve-area", {
      body: { location: "Reno, NV", refresh: false },
    });
  });

  it("passes refresh through for a manual update", async () => {
    await resolveEventArea("Reno, NV", true);

    expect(mockInvoke).toHaveBeenCalledWith("resolve-area", {
      body: { location: "Reno, NV", refresh: true },
    });
  });

  it("returns the area and sync details", async () => {
    expect(await resolveEventArea("Reno, NV")).toEqual(okBody);
  });

  it("returns a failed refresh as data, not as an error, so existing events can still show", async () => {
    mockInvokeResult = {
      data: { ...okBody, synced: false, syncError: "locator responded 503" },
      error: null,
    };

    const result = await resolveEventArea("Reno, NV", true);
    expect(result.area.id).toBe("reno-sparks");
    expect(result.synced).toBe(false);
    expect(result.syncError).toBe("locator responded 503");
  });

  it("normalises missing or wrongly-typed optional fields", async () => {
    mockInvokeResult = { data: { area: okBody.area, synced: "yes", lastSyncedAt: 5 }, error: null };

    expect(await resolveEventArea("Reno, NV")).toEqual({
      area: okBody.area,
      synced: false,
      lastSyncedAt: null,
      syncError: null,
    });
  });

  it.each(["location_not_found", "invalid_location", "not_authenticated"])(
    "surfaces the server's '%s' code",
    async (code) => {
      mockInvokeResult = { data: null, error: httpError({ error: code }) };

      expect(await codeOf(resolveEventArea("Nowhere"))).toBe(code);
    }
  );

  it("maps any other server error to 'unavailable'", async () => {
    mockInvokeResult = { data: null, error: httpError({ error: "geocoder_unavailable" }) };

    expect(await codeOf(resolveEventArea("Reno, NV"))).toBe("unavailable");
  });

  it("maps a network failure with no response body to 'unavailable'", async () => {
    mockInvokeResult = { data: null, error: { message: "Failed to send a request" } };

    expect(await codeOf(resolveEventArea("Reno, NV"))).toBe("unavailable");
  });

  it("maps an unreadable error body to 'unavailable'", async () => {
    mockInvokeResult = {
      data: null,
      error: { message: "boom", context: { json: () => Promise.reject(new Error("not json")) } },
    };

    expect(await codeOf(resolveEventArea("Reno, NV"))).toBe("unavailable");
  });

  it("rejects a success reply that has no usable area", async () => {
    mockInvokeResult = { data: { synced: true }, error: null };
    expect(await codeOf(resolveEventArea("Reno, NV"))).toBe("unavailable");

    mockInvokeResult = { data: null, error: null };
    expect(await codeOf(resolveEventArea("Reno, NV"))).toBe("unavailable");
  });
});
