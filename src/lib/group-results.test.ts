import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as groupApi from "./group-api";
import { fetchGroupResults, submitGroupResult } from "./group-api";

type QueryResult = { data: unknown; error: unknown };

let mockRpcResult: QueryResult = { data: null, error: null };
let mockTableResult: QueryResult = { data: [], error: null };
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockWrite = jest.fn();

jest.mock("./supabase", () => {
  const builder: Record<string, unknown> = {};
  builder.select = (...args: unknown[]) => { mockSelect(...args); return builder; };
  builder.eq = (...args: unknown[]) => { mockEq(...args); return builder; };
  builder.order = (...args: unknown[]) => { mockOrder(...args); return builder; };
  for (const verb of ["insert", "update", "delete", "upsert"]) {
    builder[verb] = (...args: unknown[]) => { mockWrite(verb, ...args); return builder; };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(mockTableResult);
  return {
    supabase: {
      rpc: (...args: unknown[]) => { mockRpc(...args); return Promise.resolve(mockRpcResult); },
      from: (...args: unknown[]) => { mockFrom(...args); return builder; },
    },
  };
});

// A reported round is final: one server call records it, pays it, and counts it. These tests pin
// down that the app sends only a finish order and has no other way to touch a round.
describe("group-api round results", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpcResult = { data: null, error: null };
    mockTableResult = { data: [], error: null };
  });

  describe("submitGroupResult", () => {
    it("sends only the finish order to submit_group_result - never points, outcomes, or a submitter", async () => {
      const placements = [
        { playerId: "host", placement: 1, pointsAwarded: 9999, outcome: "win", venueBonus: 500 },
        { playerId: "p2", placement: 2 },
      ];

      await submitGroupResult("group-1", 3, "host", placements);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("submit_group_result", {
        p_group_id: "group-1",
        p_round_number: 3,
        p_placements: [
          { playerId: "host", placement: 1 },
          { playerId: "p2", placement: 2 },
        ],
      });
    });

    it("writes nothing to any table itself", async () => {
      await submitGroupResult("group-1", 1, "host", [{ playerId: "host", placement: 1 }]);

      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("keeps tied placements as the host entered them", async () => {
      await submitGroupResult("group-1", 1, "host", [
        { playerId: "a", placement: 1 },
        { playerId: "b", placement: 2 },
        { playerId: "c", placement: 2 },
        { playerId: "d", placement: 4 },
      ]);

      const sent = (mockRpc.mock.calls[0][1] as { p_placements: { placement: number }[] }).p_placements;
      expect(sent.map((p) => p.placement)).toEqual([1, 2, 2, 4]);
    });

    it("passes on the server's refusal, e.g. a round that was already reported", async () => {
      mockRpcResult = { data: null, error: new Error("Round 1 has already been reported") };

      await expect(
        submitGroupResult("group-1", 1, "host", [{ playerId: "host", placement: 1 }])
      ).rejects.toThrow("Round 1 has already been reported");
    });

    it("passes on the server's refusal of a non-host", async () => {
      mockRpcResult = { data: null, error: new Error("Only the host may submit a result") };

      await expect(
        submitGroupResult("group-1", 1, "p2", [{ playerId: "p2", placement: 1 }])
      ).rejects.toThrow("Only the host may submit a result");
    });
  });

  describe("fetchGroupResults", () => {
    it("reads a group's rounds oldest first and maps them", async () => {
      mockTableResult = {
        data: [
          {
            id: "r1",
            group_id: "group-1",
            round_number: 1,
            submitted_by: "host",
            submitted_at: "2026-10-07T18:30:00.000Z",
            placements: [{ playerId: "host", placement: 1, outcome: "win", pointsAwarded: 40, venueBonus: 10 }],
          },
        ],
        error: null,
      };

      const results = await fetchGroupResults("group-1");

      expect(mockFrom).toHaveBeenCalledWith("group_results");
      expect(mockEq).toHaveBeenCalledWith("group_id", "group-1");
      expect(mockOrder).toHaveBeenCalledWith("round_number", { ascending: true });
      expect(results).toEqual([
        {
          id: "r1",
          groupId: "group-1",
          roundNumber: 1,
          submittedBy: "host",
          submittedAt: Date.UTC(2026, 9, 7, 18, 30),
          placements: [{ playerId: "host", placement: 1, outcome: "win", pointsAwarded: 40, venueBonus: 10 }],
        },
      ]);
    });

    it("has no pending or disputed state to report", async () => {
      mockTableResult = {
        data: [{ id: "r1", group_id: "g", round_number: 1, submitted_by: "h", submitted_at: "2026-10-07T00:00:00Z", placements: [] }],
        error: null,
      };

      const [result] = await fetchGroupResults("g");

      for (const gone of ["status", "disputeWindowEndsAt", "disputedBy", "disputeReasons", "appliedBy", "finalizedAt"]) {
        expect(result).not.toHaveProperty(gone);
      }
    });

    it("returns an empty list when no round has been reported, and treats missing placements as none", async () => {
      expect(await fetchGroupResults("g")).toEqual([]);

      mockTableResult = {
        data: [{ id: "r1", group_id: "g", round_number: 1, submitted_by: "h", submitted_at: "2026-10-07T00:00:00Z", placements: null }],
        error: null,
      };
      expect((await fetchGroupResults("g"))[0].placements).toEqual([]);
    });

    it("throws on a read error", async () => {
      mockTableResult = { data: null, error: new Error("offline") };
      await expect(fetchGroupResults("g")).rejects.toThrow("offline");
    });
  });

  it("offers no way to dispute, cancel, finalize, or separately collect a round", () => {
    for (const gone of [
      "disputeGroupResult",
      "cancelGroupResult",
      "finalizeGroupResultIfReady",
      "applyGroupResultPoints",
      "DISPUTE_WINDOW_MS",
    ]) {
      expect(groupApi).not.toHaveProperty(gone);
    }
  });
});
