import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import ProfileScreen from "../../app/(tabs)/profile";

interface MockUser {
  id: string;
  username: string;
  displayName?: string;
  location: string;
  games: string[];
  preferredFormats: Record<string, string[]>;
  brackets: number[];
  noGo: string[];
  pointBalance: number;
  title?: string;
}

const baseUser: MockUser = {
  id: "user-1",
  username: "dave",
  displayName: "Dave",
  location: "Reno, NV",
  games: ["mtg"],
  preferredFormats: { mtg: ["Commander"] },
  brackets: [2],
  noGo: [],
  pointBalance: 40,
};
let mockCurrentUser: MockUser | null = { ...baseUser };
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({
    currentUser: mockCurrentUser,
    session: { user: { id: "user-1" } },
    rivals: [],
    chosenRivalId: null,
    mostPlayedAgainst: null,
    clearCurrentUser: jest.fn(),
    setChosenRivalId: jest.fn(),
    theme: "dark",
    setTheme: jest.fn(),
  }),
}));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

const mockUpdateProfile = jest.fn();
jest.mock("../../hooks/useProfileQueries", () => ({
  useUpdateProfileMutation: () => ({ mutate: mockUpdateProfile }),
}));
jest.mock("../../hooks/useRewardQueries", () => ({
  useClaimStarterReward: () => jest.fn(),
}));
jest.mock("../../hooks/useShopQueries", () => ({
  useShopItemsQuery: () => ({ data: [] }),
  useOwnedShopItemsQuery: () => ({ data: [] }),
  useEquipShopItemMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("../../lib/auth-api", () => ({ updatePassword: jest.fn() }));

describe("ProfileScreen name and location fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { ...baseUser };
  });

  it("shows the saved name and location", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    expect(getByPlaceholderText("Your area").props.value).toBe("Reno, NV");
    expect(getByPlaceholderText("Display name").props.value).toBe("Dave");
  });

  it("follows a location changed on another screen, without a reload", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    // What the Calendar tab's "Change" does: the shared profile gets a new location.
    mockCurrentUser = { ...baseUser, location: "Sacramento, CA" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText("Your area").props.value).toBe("Sacramento, CA");
  });

  it("follows a display name changed elsewhere too", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    mockCurrentUser = { ...baseUser, displayName: "David" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText("Display name").props.value).toBe("David");
  });

  it("keeps what the player is typing even if the profile changes underneath", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText("Your area"), "Spar");
    mockCurrentUser = { ...baseUser, location: "Sacramento, CA" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText("Your area").props.value).toBe("Spar");
  });

  it("saves the typed location to the shared profile, then goes back to showing it", async () => {
    const { getByPlaceholderText, getByText, queryByText, rerender } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText("Your area"), "  Sparks, NV ");
    await fireEvent.press(getByText("Save Changes"));

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    const sent = mockUpdateProfile.mock.calls[0][0] as { userId: string; patch: { location: string } };
    expect(sent.userId).toBe("user-1");
    expect(sent.patch.location).toBe("Sparks, NV");
    expect(queryByText("Save Changes")).toBeNull();

    // The save updates the shared profile; the field shows that, and follows later changes again.
    mockCurrentUser = { ...baseUser, location: "Sparks, NV" };
    await rerender(<ProfileScreen />);
    expect(getByPlaceholderText("Your area").props.value).toBe("Sparks, NV");
    mockCurrentUser = { ...baseUser, location: "Carson City, NV" };
    await rerender(<ProfileScreen />);
    expect(getByPlaceholderText("Your area").props.value).toBe("Carson City, NV");
  });

  it("drops the typed text and shows the saved profile again on Discard", async () => {
    const { getByPlaceholderText, getByText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText("Your area"), "Nowhere");
    await fireEvent.press(getByText("Discard Changes"));

    expect(getByPlaceholderText("Your area").props.value).toBe("Reno, NV");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<ProfileScreen />);

    expect(toJSON()).toBeNull();
  });
});
