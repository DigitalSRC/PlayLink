import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as groupApi from "./group-api";
import {
  fetchGroupBallots,
  fetchGroupResults,
  mapResultRow,
  settleGroupResultIfDue,
  submitGroupResult,
  voteGroupResult,
} from "./group-api";

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

// A reported round is pending for 15 minutes while the other players agree or contest, then the
// server pays the order with the most votes. These tests pin down that the app only ever sends
// finish orders - a report or a vote - and has no other way to touch a round.
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
          status: "finalized",
          windowEndsAt: Date.UTC(2026, 9, 7, 18, 30),
          overturned: false,
          placements: [{ playerId: "host", placement: 1, outcome: "win", pointsAwarded: 40, venueBonus: 10 }],
        },
      ]);
    });

    it("asks for whole rows, so a server without the contest window's columns still answers", async () => {
      await fetchGroupResults("g");
      expect(mockSelect).toHaveBeenCalledWith("*");
    });

    it("does not expose the leftover dispute columns", async () => {
      mockTableResult = {
        data: [{
          id: "r1", group_id: "g", round_number: 1, submitted_by: "h", submitted_at: "2026-10-07T00:00:00Z", placements: [],
          disputed_by: [], dispute_reasons: {}, applied_by: [], finalized_at: null,
        }],
        error: null,
      };

      const [result] = await fetchGroupResults("g");

      for (const gone of ["disputedBy", "disputeReasons", "appliedBy", "finalizedAt", "disputed_by", "applied_by"]) {
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

  describe("mapResultRow", () => {
    const row = {
      id: "r1", group_id: "g", round_number: 2, submitted_by: "h",
      submitted_at: "2026-10-12T20:00:00.000Z", placements: [],
    };

    it("reads a pending round with its window end", () => {
      const result = mapResultRow({ ...row, status: "pending", dispute_window_ends_at: "2026-10-12T20:15:00.000Z", overturned: false });
      expect(result.status).toBe("pending");
      expect(result.windowEndsAt - result.submittedAt).toBe(15 * 60 * 1000);
      expect(result.overturned).toBe(false);
    });

    it("reads a settled round, and whether the votes replaced the report", () => {
      expect(mapResultRow({ ...row, status: "finalized", overturned: true })).toMatchObject({ status: "finalized", overturned: true });
    });

    it("treats a row with no status, an unknown status, or no window as final and not overturned", () => {
      for (const status of [undefined, null, "disputed", ""]) {
        const result = mapResultRow({ ...row, status });
        expect(result.status).toBe("finalized");
        expect(result.overturned).toBe(false);
        expect(result.windowEndsAt).toBe(result.submittedAt);
      }
    });
  });

  describe("fetchGroupBallots", () => {
    it("reads the group's votes and maps them", async () => {
      mockTableResult = {
        data: [
          { result_id: "r1", player_id: "host", placements: [{ playerId: "host", placement: 1 }] },
          { result_id: "r1", player_id: "p2", placements: null },
        ],
        error: null,
      };

      const ballots = await fetchGroupBallots("group-1");

      expect(mockFrom).toHaveBeenCalledWith("group_result_ballots");
      expect(mockEq).toHaveBeenCalledWith("group_id", "group-1");
      expect(ballots).toEqual([
        { resultId: "r1", playerId: "host", placements: [{ playerId: "host", placement: 1 }] },
        { resultId: "r1", playerId: "p2", placements: [] },
      ]);
    });

    it("throws on a read error, such as a server with no ballots table", async () => {
      mockTableResult = { data: null, error: new Error("relation does not exist") };
      await expect(fetchGroupBallots("g")).rejects.toThrow("relation does not exist");
    });
  });

  describe("voteGroupResult", () => {
    it("agreeing sends no order at all", async () => {
      mockRpcResult = { data: "recorded", error: null };

      expect(await voteGroupResult("r1", null)).toBe("recorded");
      expect(mockRpc).toHaveBeenCalledWith("vote_group_result", { p_result_id: "r1", p_placements: null });
    });

    it("contesting sends only the finish order - never points or outcomes", async () => {
      mockRpcResult = { data: "recorded", error: null };

      await voteGroupResult("r1", [
        { playerId: "p2", placement: 1, pointsAwarded: 9999, outcome: "win" } as never,
        { playerId: "host", placement: 2 },
      ]);

      expect(mockRpc).toHaveBeenCalledWith("vote_group_result", {
        p_result_id: "r1",
        p_placements: [{ playerId: "p2", placement: 1 }, { playerId: "host", placement: 2 }],
      });
    });

    it("reports when the vote was the last one and the round was paid", async () => {
      mockRpcResult = { data: "settled", error: null };
      expect(await voteGroupResult("r1", null)).toBe("settled");
    });

    it("reads any other answer as merely recorded", async () => {
      mockRpcResult = { data: null, error: null };
      expect(await voteGroupResult("r1", null)).toBe("recorded");
    });

    it("passes on the server's refusal", async () => {
      mockRpcResult = { data: null, error: new Error("The time to contest this round has passed") };
      await expect(voteGroupResult("r1", null)).rejects.toThrow("has passed");
    });
  });

  describe("settleGroupResultIfDue", () => {
    it("asks the server to settle an overdue round and says whether it did", async () => {
      mockRpcResult = { data: true, error: null };
      expect(await settleGroupResultIfDue("r1")).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith("settle_group_result_if_due", { p_result_id: "r1" });

      mockRpcResult = { data: false, error: null };
      expect(await settleGroupResultIfDue("r1")).toBe(false);
      mockRpcResult = { data: null, error: null };
      expect(await settleGroupResultIfDue("r1")).toBe(false);
    });

    it("passes on the server's refusal", async () => {
      mockRpcResult = { data: null, error: new Error("Only players in this group can do that") };
      await expect(settleGroupResultIfDue("r1")).rejects.toThrow("Only players in this group");
    });
  });

  it("never writes a round or a ballot directly", async () => {
    mockRpcResult = { data: "recorded", error: null };
    await submitGroupResult("g", 1, "h", [{ playerId: "h", placement: 1 }]);
    await voteGroupResult("r1", null);
    await settleGroupResultIfDue("r1");
    await fetchGroupResults("g");
    await fetchGroupBallots("g");
    expect(mockWrite).not.toHaveBeenCalled();
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
