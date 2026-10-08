import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  equipShopItem,
  fetchOwnedShopItemIds,
  fetchShopItems,
  mapShopItemRow,
  purchaseShopItem,
} from "./shop-api";

type QueryResult = { data: unknown; error: unknown };

// A stand-in for the Supabase client: table reads go through a chainable builder that resolves
// to whatever mockTableResult holds, and rpc() resolves to mockRpcResult.
let mockTableResult: QueryResult = { data: [], error: null };
let mockRpcResult: QueryResult = { data: null, error: null };
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockRpc = jest.fn();

jest.mock("./supabase", () => {
  const builder: Record<string, unknown> = {};
  builder.select = (...args: unknown[]) => { mockSelect(...args); return builder; };
  builder.eq = (...args: unknown[]) => { mockEq(...args); return builder; };
  builder.order = (...args: unknown[]) => { mockOrder(...args); return builder; };
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(mockTableResult);
  return {
    supabase: {
      from: (...args: unknown[]) => { mockFrom(...args); return builder; },
      rpc: (...args: unknown[]) => { mockRpc(...args); return Promise.resolve(mockRpcResult); },
    },
  };
});

const row = {
  id: "title-kingmaker",
  kind: "title" as const,
  name: "Kingmaker",
  value: "Kingmaker",
  description: "Can't win. Decides who does.",
  price: 100,
  sort_order: 201,
  joined_before: null,
};

describe("shop-api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTableResult = { data: [], error: null };
    mockRpcResult = { data: null, error: null };
  });

  describe("mapShopItemRow", () => {
    it("converts a catalog row to the app's shape", () => {
      expect(mapShopItemRow(row)).toEqual({
        id: "title-kingmaker",
        kind: "title",
        name: "Kingmaker",
        value: "Kingmaker",
        description: "Can't win. Decides who does.",
        price: 100,
        sortOrder: 201,
        joinedBefore: undefined,
      });
    });

    it("turns an early-supporter cutoff into a timestamp", () => {
      const beta = mapShopItemRow({ ...row, id: "title-beta-tester", price: 0, joined_before: "2027-01-01T00:00:00+00:00" });
      expect(beta.joinedBefore).toBe(Date.UTC(2027, 0, 1));
    });
  });

  describe("fetchShopItems", () => {
    it("reads only items that are switched on, in display order", async () => {
      mockTableResult = { data: [row], error: null };

      const items = await fetchShopItems();

      expect(mockFrom).toHaveBeenCalledWith("shop_items");
      expect(mockEq).toHaveBeenCalledWith("is_active", true);
      expect(mockOrder).toHaveBeenCalledWith("sort_order", { ascending: true });
      expect(items.map((i) => i.id)).toEqual(["title-kingmaker"]);
    });

    it("returns an empty list when nothing is for sale", async () => {
      expect(await fetchShopItems()).toEqual([]);
    });

    it("throws when the catalog can't be read", async () => {
      mockTableResult = { data: null, error: new Error("permission denied") };
      await expect(fetchShopItems()).rejects.toThrow("permission denied");
    });
  });

  describe("fetchOwnedShopItemIds", () => {
    it("returns the ids of the caller's purchases without sending a player id", async () => {
      mockTableResult = { data: [{ item_id: "title-kingmaker" }, { item_id: "color-sky" }], error: null };

      expect(await fetchOwnedShopItemIds()).toEqual(["title-kingmaker", "color-sky"]);
      expect(mockFrom).toHaveBeenCalledWith("shop_purchases");
      // Row-level security scopes this to the caller; the client must not filter by an id it chose.
      expect(mockEq).not.toHaveBeenCalled();
    });

    it("returns an empty list for a player who has bought nothing", async () => {
      expect(await fetchOwnedShopItemIds()).toEqual([]);
    });

    it("throws on a read error", async () => {
      mockTableResult = { data: null, error: new Error("offline") };
      await expect(fetchOwnedShopItemIds()).rejects.toThrow("offline");
    });
  });

  describe("purchaseShopItem", () => {
    it("asks the server to buy by item id only - never sending a price - and returns the new balance", async () => {
      mockRpcResult = { data: 900, error: null };

      expect(await purchaseShopItem("title-kingmaker")).toBe(900);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("purchase_shop_item", { p_item_id: "title-kingmaker" });
      // No direct table write: the server is the only thing that moves points.
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("passes the server's refusal on", async () => {
      mockRpcResult = { data: null, error: new Error("Not enough points") };
      await expect(purchaseShopItem("border-gold")).rejects.toThrow("Not enough points");
    });
  });

  describe("equipShopItem", () => {
    it("asks the server to wear an item", async () => {
      await equipShopItem("title", "title-kingmaker");
      expect(mockRpc).toHaveBeenCalledWith("equip_shop_item", { p_kind: "title", p_item_id: "title-kingmaker" });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("sends null to take a slot's item off", async () => {
      await equipShopItem("card_border", null);
      expect(mockRpc).toHaveBeenCalledWith("equip_shop_item", { p_kind: "card_border", p_item_id: null });
    });

    it("passes the server's refusal on", async () => {
      mockRpcResult = { data: null, error: new Error("You do not own this item") };
      await expect(equipShopItem("title", "title-living-legend")).rejects.toThrow("You do not own this item");
    });
  });
});
