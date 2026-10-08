import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import ShopScreen from "../../app/(tabs)/shop";
import { ShopItem } from "../../data/shop";

interface MockUser {
  id: string;
  username: string;
  displayName?: string;
  pointBalance: number;
  title?: string;
  nameColor?: string;
  cardBorder?: string;
  createdAt?: number;
}

const baseUser: MockUser = { id: "user-1", username: "dave", displayName: "Dave", pointBalance: 120, createdAt: Date.UTC(2026, 5, 1) };
let mockCurrentUser: MockUser | null = baseUser;
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ currentUser: mockCurrentUser, session: { user: { id: "user-1" } }, theme: "dark" }),
}));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

interface MockQuery { data?: unknown; isLoading: boolean; isError: boolean }
let mockItemsQuery: MockQuery = { data: [], isLoading: false, isError: false };
let mockOwnedQuery: MockQuery = { data: [], isLoading: false, isError: false };
const mockRefetchItems = jest.fn();
const mockRefetchOwned = jest.fn();
const mockPurchase = jest.fn<(vars: { userId: string; itemId: string }) => Promise<number>>();
const mockEquip = jest.fn<(vars: { userId: string; kind: string; itemId: string | null }) => Promise<void>>();
jest.mock("../../hooks/useShopQueries", () => ({
  useShopItemsQuery: () => ({ ...mockItemsQuery, refetch: mockRefetchItems }),
  useOwnedShopItemsQuery: () => ({ ...mockOwnedQuery, refetch: mockRefetchOwned }),
  usePurchaseShopItemMutation: () => ({ mutateAsync: (vars: { userId: string; itemId: string }) => mockPurchase(vars) }),
  useEquipShopItemMutation: () => ({
    mutateAsync: (vars: { userId: string; kind: string; itemId: string | null }) => mockEquip(vars),
  }),
}));

const makeItem = (overrides: Partial<ShopItem>): ShopItem => ({
  id: "title-kingmaker",
  kind: "title",
  name: "Kingmaker",
  value: "Kingmaker",
  description: "Decides who wins.",
  price: 100,
  sortOrder: 1,
  ...overrides,
});

const kingmaker = makeItem({});
const legend = makeItem({ id: "title-living-legend", name: "Living Legend", value: "Living Legend", price: 1200, sortOrder: 2 });
const beta = makeItem({ id: "title-beta-tester", name: "Beta Tester", value: "Beta Tester", price: 0, sortOrder: 0, joinedBefore: Date.UTC(2027, 0, 1) });
const sky = makeItem({ id: "color-sky", kind: "name_color", name: "Sky", value: "#3D9BFF", price: 150 });
const gold = makeItem({ id: "border-gold", kind: "card_border", name: "Gold", value: "gold", price: 900 });
const catalog = [kingmaker, legend, beta, sky, gold];

/** Presses the confirm button of the most recent Alert (the last button passed to it). */
const confirmLastAlert = async (alertSpy: jest.SpiedFunction<typeof Alert.alert>) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] ?? [];
  await act(async () => {
    await buttons[buttons.length - 1].onPress?.();
  });
};

describe("ShopScreen", () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { ...baseUser };
    mockItemsQuery = { data: catalog, isLoading: false, isError: false };
    mockOwnedQuery = { data: [], isLoading: false, isError: false };
    mockPurchase.mockResolvedValue(20);
    mockEquip.mockResolvedValue(undefined);
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("shows the spendable points and the three sections", async () => {
    const { getByText } = await render(<ShopScreen />);

    expect(getByText("YOUR POINTS")).toBeTruthy();
    expect(getByText("120")).toBeTruthy();
    expect(getByText("Titles")).toBeTruthy();
    expect(getByText("Name Colors")).toBeTruthy();
    expect(getByText("Card Borders")).toBeTruthy();
    expect(getByText(/never lowers your Score/)).toBeTruthy();
  });

  it("prices what can be bought, marks free items, and says how far off the rest are", async () => {
    const { getByLabelText, getByText } = await render(<ShopScreen />);

    expect(getByLabelText("Buy Kingmaker for 100 pts").props.accessibilityState.disabled).toBe(false);
    expect(getByLabelText("Claim Beta Tester for Free").props.accessibilityState.disabled).toBe(false);
    expect(getByLabelText("Buy Living Legend for 1200 pts").props.accessibilityState.disabled).toBe(true);
    expect(getByText("1080 more points to go")).toBeTruthy();
    expect(getByText("30 more points to go")).toBeTruthy(); // Sky at 150
    expect(getByText("EARLY SUPPORTER")).toBeTruthy();
  });

  it("asks before buying, buys by item id, and does not put the item on by itself", async () => {
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    expect(mockPurchase).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Buy “Kingmaker”?", expect.stringContaining("You’ll have 20 left"), expect.any(Array));

    await confirmLastAlert(alertSpy);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("“Kingmaker” is yours", expect.any(String), expect.any(Array));
    });
    expect(mockPurchase).toHaveBeenCalledTimes(1);
    expect(mockPurchase).toHaveBeenCalledWith({ userId: "user-1", itemId: "title-kingmaker" });
    expect(mockEquip).not.toHaveBeenCalled();

    const offer = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] ?? [];
    expect(offer.map((b) => b.text)).toEqual(["Not Now", "Wear It Now"]);
  });

  it("puts the new item on when the player chooses Wear It Now", async () => {
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    await confirmLastAlert(alertSpy);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("“Kingmaker” is yours", expect.any(String), expect.any(Array));
    });
    await confirmLastAlert(alertSpy);

    await waitFor(() => {
      expect(mockEquip).toHaveBeenCalledWith({ userId: "user-1", kind: "title", itemId: "title-kingmaker" });
    });
    expect(mockEquip).toHaveBeenCalledTimes(1);
  });

  it("leaves the player's look alone when they choose Not Now", async () => {
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    await confirmLastAlert(alertSpy);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("“Kingmaker” is yours", expect.any(String), expect.any(Array));
    });
    const offer = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] ?? [];
    await act(async () => {
      await offer[0].onPress?.();
    });

    expect(mockEquip).not.toHaveBeenCalled();
    expect(mockPurchase).toHaveBeenCalledTimes(1);
  });

  it("buys nothing when the player cancels", async () => {
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    expect(buttons[0].text).toBe("Cancel");
    buttons[0].onPress?.();

    expect(mockPurchase).not.toHaveBeenCalled();
    expect(mockEquip).not.toHaveBeenCalled();
  });

  it("cannot be made to buy something the player can't afford", async () => {
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Living Legend for 1200 pts"));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it("shows the server's reason when a purchase is refused, and does not put the item on", async () => {
    mockPurchase.mockRejectedValueOnce(new Error("Not enough points"));
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    await confirmLastAlert(alertSpy);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Couldn’t buy that", "Not enough points");
    });
    expect(mockEquip).not.toHaveBeenCalled();
  });

  it("still counts as bought if putting it on fails afterwards, and says which step failed", async () => {
    mockEquip.mockRejectedValueOnce(new Error("offline"));
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Buy Kingmaker for 100 pts"));
    await confirmLastAlert(alertSpy);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("“Kingmaker” is yours", expect.any(String), expect.any(Array));
    });
    await confirmLastAlert(alertSpy);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("Couldn’t change your look", "offline");
    });
    expect(mockEquip).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalledWith("Couldn’t buy that", expect.anything());
  });

  it("offers Wear for an owned item and Wearing for the one that is on", async () => {
    mockOwnedQuery = { data: ["title-kingmaker", "color-sky"], isLoading: false, isError: false };
    mockCurrentUser = { ...baseUser, title: "Kingmaker" };
    const { getByLabelText, getByText, getAllByText } = await render(<ShopScreen />);

    expect(getByText("Wearing ✓")).toBeTruthy();
    expect(getByText("Wear")).toBeTruthy();
    // The look preview shows the title that is on.
    expect(getAllByText("Kingmaker").length).toBeGreaterThan(1);

    await fireEvent.press(getByLabelText("Wear Sky"));
    await waitFor(() => {
      expect(mockEquip).toHaveBeenCalledWith({ userId: "user-1", kind: "name_color", itemId: "color-sky" });
    });
    expect(mockPurchase).not.toHaveBeenCalled();
  });

  it("takes an item off when the one being worn is tapped", async () => {
    mockOwnedQuery = { data: ["title-kingmaker"], isLoading: false, isError: false };
    mockCurrentUser = { ...baseUser, title: "Kingmaker" };
    const { getByLabelText } = await render(<ShopScreen />);

    await fireEvent.press(getByLabelText("Take off Kingmaker"));

    await waitFor(() => {
      expect(mockEquip).toHaveBeenCalledWith({ userId: "user-1", kind: "title", itemId: null });
    });
  });

  it("does not list early-supporter items for a profile created after the cutoff", async () => {
    mockCurrentUser = { ...baseUser, createdAt: Date.UTC(2027, 2, 1) };
    const { queryByText, getByLabelText } = await render(<ShopScreen />);

    expect(queryByText("Beta Tester")).toBeNull();
    expect(queryByText("EARLY SUPPORTER")).toBeNull();
    expect(getByLabelText("Buy Kingmaker for 100 pts")).toBeTruthy();
  });

  it("keeps an early-supporter item wearable for someone who already owns it", async () => {
    mockCurrentUser = { ...baseUser, createdAt: Date.UTC(2027, 2, 1) };
    mockOwnedQuery = { data: ["title-beta-tester"], isLoading: false, isError: false };
    const { getByLabelText } = await render(<ShopScreen />);

    expect(getByLabelText("Wear Beta Tester")).toBeTruthy();
  });

  it("says so when the player has nothing on yet", async () => {
    const { getByText } = await render(<ShopScreen />);
    expect(getByText(/Nothing on yet/)).toBeTruthy();
  });

  it("offers a retry when the shop can't be loaded", async () => {
    mockItemsQuery = { data: undefined, isLoading: false, isError: true };
    const { getByText, queryByText } = await render(<ShopScreen />);

    expect(getByText("Couldn’t load the shop")).toBeTruthy();
    expect(queryByText("Titles")).toBeNull();

    await fireEvent.press(getByText("Try again"));
    expect(mockRefetchItems).toHaveBeenCalled();
    expect(mockRefetchOwned).toHaveBeenCalled();
  });

  it("says so when nothing is for sale", async () => {
    mockItemsQuery = { data: [], isLoading: false, isError: false };
    const { getByText } = await render(<ShopScreen />);
    expect(getByText("Nothing is for sale right now.")).toBeTruthy();
  });

  it("goes back from the Back link", async () => {
    const { getByLabelText } = await render(<ShopScreen />);
    await fireEvent.press(getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<ShopScreen />);
    expect(toJSON()).toBeNull();
  });
});
