import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { claimStarterReward, fetchStarterRewards } from "./reward-api";

type Result = { data: unknown; error: unknown };

let mockSelectResult: Result = { data: [], error: null };
let mockRpcResult: Result = { data: 0, error: null };
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockRpc = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        select: (columns: string) => {
          mockSelect(columns);
          return Promise.resolve(mockSelectResult);
        },
      };
    },
    rpc: (...args: unknown[]) => {
      mockRpc(...args);
      return Promise.resolve(mockRpcResult);
    },
  },
}));

describe("reward-api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectResult = { data: [], error: null };
    mockRpcResult = { data: 0, error: null };
  });

  describe("fetchStarterRewards", () => {
    it("reads the caller's claimed reward keys without sending a player id", async () => {
      mockSelectResult = { data: [{ reward_key: "create_group" }, { reward_key: "view_calendar" }], error: null };

      expect(await fetchStarterRewards()).toEqual(["create_group", "view_calendar"]);
      expect(mockFrom).toHaveBeenCalledWith("starter_rewards");
      expect(mockSelect).toHaveBeenCalledWith("reward_key");
    });

    it("returns an empty list for a player who has claimed nothing", async () => {
      expect(await fetchStarterRewards()).toEqual([]);
    });

    it("throws when the table can't be read, so callers can hide the rewards", async () => {
      const error = { code: "42P01", message: 'relation "starter_rewards" does not exist' };
      mockSelectResult = { data: null, error };

      await expect(fetchStarterRewards()).rejects.toBe(error);
    });
  });

  describe("claimStarterReward", () => {
    it("asks the server by key only - never an amount or a player id", async () => {
      mockRpcResult = { data: 25, error: null };

      expect(await claimStarterReward("join_group")).toBe(25);
      expect(mockRpc).toHaveBeenCalledWith("claim_starter_reward", { p_key: "join_group" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns 0 when the reward was already claimed", async () => {
      mockRpcResult = { data: 0, error: null };

      expect(await claimStarterReward("view_calendar")).toBe(0);
    });

    it("treats a missing value as nothing paid", async () => {
      mockRpcResult = { data: null, error: null };

      expect(await claimStarterReward("view_calendar")).toBe(0);
    });

    it("throws the server's refusal", async () => {
      const error = { message: "Post a group first" };
      mockRpcResult = { data: null, error };

      await expect(claimStarterReward("create_group")).rejects.toBe(error);
    });
  });
});
