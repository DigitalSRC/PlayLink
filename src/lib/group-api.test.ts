import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { deleteGroup, leaveGroup, setGroupHost } from "./group-api";

type RpcResult = { data: unknown; error: unknown };

let mockRpcResult: RpcResult = { data: null, error: null };
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      mockRpc(...args);
      return Promise.resolve(mockRpcResult);
    },
    // The lifecycle calls must never touch a table directly; this lets the tests prove it.
    from: (...args: unknown[]) => {
      mockFrom(...args);
      throw new Error("direct table access is not expected here");
    },
  },
}));

describe("group-api lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpcResult = { data: null, error: null };
  });

  describe("leaveGroup", () => {
    it("calls leave_group with only the group id, never a player id", async () => {
      mockRpcResult = { data: "left", error: null };

      await leaveGroup("group-1");

      expect(mockRpc).toHaveBeenCalledWith("leave_group", { p_group_id: "group-1" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it.each(["left", "deleted", "not_member"] as const)("returns the server's outcome: %s", async (outcome) => {
      mockRpcResult = { data: outcome, error: null };

      expect(await leaveGroup("group-1")).toBe(outcome);
    });

    it("throws the server error", async () => {
      const error = { message: "Not authenticated" };
      mockRpcResult = { data: null, error };

      await expect(leaveGroup("group-1")).rejects.toBe(error);
    });
  });

  describe("deleteGroup", () => {
    it("calls delete_group instead of deleting from the table", async () => {
      await deleteGroup("group-1");

      expect(mockRpc).toHaveBeenCalledWith("delete_group", { p_group_id: "group-1" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("throws when the server refuses a non-host", async () => {
      const error = { message: "Only the host may delete a group" };
      mockRpcResult = { data: null, error };

      await expect(deleteGroup("group-1")).rejects.toBe(error);
    });
  });

  describe("setGroupHost", () => {
    it("calls transfer_group_host with the group and the new host", async () => {
      await setGroupHost("group-1", "player-2");

      expect(mockRpc).toHaveBeenCalledWith("transfer_group_host", {
        p_group_id: "group-1",
        p_new_host_id: "player-2",
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("throws when the server refuses the transfer", async () => {
      const error = { message: "The new host must be a member of this group" };
      mockRpcResult = { data: null, error };

      await expect(setGroupHost("group-1", "stranger")).rejects.toBe(error);
    });
  });
});
