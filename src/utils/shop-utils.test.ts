import { describe, expect, it } from "@jest/globals";
import { BORDER_STYLES, ShopItem } from "../data/shop";
import {
  borderStyleFor,
  groupShopItems,
  pointsShort,
  safeNameColor,
  shopItemState,
  wornValue,
} from "./shop-utils";

const makeItem = (overrides: Partial<ShopItem>): ShopItem => ({
  id: "title-kingmaker",
  kind: "title",
  name: "Kingmaker",
  value: "Kingmaker",
  description: "",
  price: 100,
  sortOrder: 0,
  ...overrides,
});

const NOTHING = new Set<string>();
const CUTOFF = Date.UTC(2027, 0, 1);

describe("shop-utils", () => {
  describe("groupShopItems", () => {
    it("puts items into the three sections in a fixed order", () => {
      const sections = groupShopItems([
        makeItem({ id: "b", kind: "card_border", value: "gold" }),
        makeItem({ id: "t", kind: "title" }),
        makeItem({ id: "c", kind: "name_color", value: "#3D9BFF" }),
      ]);
      expect(sections.map((s) => s.kind)).toEqual(["title", "name_color", "card_border"]);
      expect(sections.map((s) => s.items.map((i) => i.id))).toEqual([["t"], ["c"], ["b"]]);
    });

    it("orders a section by sort order, then price, then name", () => {
      const [titles] = groupShopItems([
        makeItem({ id: "late", sortOrder: 5, price: 10 }),
        makeItem({ id: "pricey", sortOrder: 1, price: 200, name: "A" }),
        makeItem({ id: "zed", sortOrder: 1, price: 50, name: "Zed" }),
        makeItem({ id: "alpha", sortOrder: 1, price: 50, name: "Alpha" }),
      ]);
      expect(titles.items.map((i) => i.id)).toEqual(["alpha", "zed", "pricey", "late"]);
    });

    it("keeps an empty section, and returns three empty ones for an empty catalog", () => {
      const sections = groupShopItems([makeItem({ kind: "title" })]);
      expect(sections).toHaveLength(3);
      expect(sections[1].items).toEqual([]);
      expect(groupShopItems([]).every((s) => s.items.length === 0)).toBe(true);
    });

    it("leaves out an item of a kind the app doesn't know", () => {
      const odd = makeItem({ id: "hat", kind: "hat" as ShopItem["kind"] });
      expect(groupShopItems([odd]).flatMap((s) => s.items)).toEqual([]);
    });
  });

  describe("wornValue", () => {
    it("reads each slot from the profile's look", () => {
      const look = { title: "Kingmaker", nameColor: "#3D9BFF", cardBorder: "gold" };
      expect(wornValue(look, "title")).toBe("Kingmaker");
      expect(wornValue(look, "name_color")).toBe("#3D9BFF");
      expect(wornValue(look, "card_border")).toBe("gold");
      expect(wornValue({}, "title")).toBeUndefined();
    });
  });

  describe("shopItemState", () => {
    const item = makeItem({ price: 100 });

    it("is affordable at exactly the price and too expensive one point under", () => {
      expect(shopItemState(item, NOTHING, 100, {})).toBe("affordable");
      expect(shopItemState(item, NOTHING, 99, {})).toBe("too_expensive");
      expect(shopItemState(item, NOTHING, 5000, {})).toBe("affordable");
    });

    it("treats a free item as affordable with no points at all", () => {
      expect(shopItemState(makeItem({ price: 0 }), NOTHING, 0, {})).toBe("affordable");
    });

    it("affords nothing on a negative or broken balance", () => {
      expect(shopItemState(item, NOTHING, -50, {})).toBe("too_expensive");
      expect(shopItemState(item, NOTHING, Number.NaN, {})).toBe("too_expensive");
      expect(shopItemState(makeItem({ price: 0 }), NOTHING, Number.NaN, {})).toBe("affordable");
    });

    it("shows an owned item as owned, or equipped when it is the one being worn", () => {
      const owned = new Set([item.id]);
      expect(shopItemState(item, owned, 0, {})).toBe("owned");
      expect(shopItemState(item, owned, 0, { title: "Kingmaker" })).toBe("equipped");
      expect(shopItemState(item, owned, 0, { title: "Archenemy" })).toBe("owned");
    });

    it("does not call an item equipped just because another slot has the same text", () => {
      const colour = makeItem({ id: "color-x", kind: "name_color", value: "Kingmaker" });
      expect(shopItemState(colour, new Set([colour.id]), 0, { title: "Kingmaker" })).toBe("owned");
    });

    it("does not call an unowned item equipped even if the profile shows its value", () => {
      expect(shopItemState(item, NOTHING, 500, { title: "Kingmaker" })).toBe("affordable");
    });

    it("offers an early-supporter item only to profiles created before the cutoff", () => {
      const beta = makeItem({ id: "title-beta-tester", price: 0, joinedBefore: CUTOFF });
      expect(shopItemState(beta, NOTHING, 0, {}, CUTOFF - 1)).toBe("affordable");
      expect(shopItemState(beta, NOTHING, 0, {}, CUTOFF)).toBe("unavailable");
      expect(shopItemState(beta, NOTHING, 9999, {}, CUTOFF + 1)).toBe("unavailable");
    });

    it("treats an unknown join date as too late, rather than offering and then refusing", () => {
      const beta = makeItem({ price: 0, joinedBefore: CUTOFF });
      expect(shopItemState(beta, NOTHING, 0, {}, undefined)).toBe("unavailable");
    });

    it("keeps an early-supporter item wearable for someone who already owns it", () => {
      const beta = makeItem({ id: "title-beta-tester", value: "Beta Tester", price: 0, joinedBefore: CUTOFF });
      const owned = new Set([beta.id]);
      expect(shopItemState(beta, owned, 0, {}, CUTOFF + 1)).toBe("owned");
      expect(shopItemState(beta, owned, 0, { title: "Beta Tester" }, undefined)).toBe("equipped");
    });
  });

  describe("pointsShort", () => {
    it("says how many more points are needed, never less than zero", () => {
      const item = makeItem({ price: 250 });
      expect(pointsShort(item, 100)).toBe(150);
      expect(pointsShort(item, 250)).toBe(0);
      expect(pointsShort(item, 900)).toBe(0);
      expect(pointsShort(item, Number.NaN)).toBe(250);
    });
  });

  describe("safeNameColor", () => {
    it("passes an uppercase six-digit hex color through", () => {
      expect(safeNameColor("#3D9BFF")).toBe("#3D9BFF");
    });

    it("rejects anything else, so a bad profile value can't reach a style", () => {
      for (const bad of ["#3d9bff", "#FFF", "red", "", "3D9BFF", "#3D9BFFAA", "#GGGGGG", "url(x)", " #3D9BFF"]) {
        expect(safeNameColor(bad)).toBeUndefined();
      }
      expect(safeNameColor(undefined)).toBeUndefined();
      expect(safeNameColor(null)).toBeUndefined();
    });
  });

  describe("borderStyleFor", () => {
    it("finds every border the opening catalog sells", () => {
      for (const key of ["obsidian", "bronze", "silver", "gold", "ember", "arcane", "verdant", "founder"]) {
        expect(borderStyleFor(key)).toBe(BORDER_STYLES[key]);
        expect(borderStyleFor(key)?.width).toBeGreaterThan(0);
      }
    });

    it("draws nothing for no border, an unknown key, or an inherited object key", () => {
      expect(borderStyleFor(undefined)).toBeUndefined();
      expect(borderStyleFor(null)).toBeUndefined();
      expect(borderStyleFor("")).toBeUndefined();
      expect(borderStyleFor("platinum")).toBeUndefined();
      expect(borderStyleFor("toString")).toBeUndefined();
      expect(borderStyleFor("constructor")).toBeUndefined();
    });

    it("uses only valid colors in every border style", () => {
      for (const style of Object.values(BORDER_STYLES)) {
        expect(style.outer).toMatch(/^#[0-9A-F]{6}$/);
        if (style.inner !== undefined) expect(style.inner).toMatch(/^#[0-9A-F]{6}$/);
      }
    });
  });
});
