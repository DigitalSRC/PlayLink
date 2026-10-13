import { act, fireEvent, render } from "@testing-library/react-native";
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
// Pull-to-refresh reaches for React Query and global context; this screen test renders without either.
jest.mock("../../hooks/useRefresh", () => ({
  usePullToRefresh: () => ({ refreshing: false, onRefresh: jest.fn() }),
}));

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

// The tab losing focus is simulated by running the cleanup the screen registered.
let mockLeaveTab: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (effect: () => (() => void) | void) => {
    mockLeaveTab = effect() ?? undefined;
  },
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

const mockShowToast = jest.fn();
jest.mock("../../components/AppToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
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
const mockUpdatePassword = jest.fn<(current: string, next: string) => Promise<void>>();
jest.mock("../../lib/auth-api", () => ({
  MIN_PASSWORD_LENGTH: 10,
  updatePassword: (current: string, next: string) => mockUpdatePassword(current, next),
}));

// Leaving the tab saves, which updates the screen, so it has to happen inside act().
const leaveTab = () =>
  act(async () => {
    mockLeaveTab?.();
  });

const LOCATION = "City, State - e.g. Reno, NV";
const NAME = "Display name";

describe("ProfileScreen name and location fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { ...baseUser };
    mockLeaveTab = undefined;
  });

  it("shows the saved name and location", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    expect(getByPlaceholderText(LOCATION).props.value).toBe("Reno, NV");
    expect(getByPlaceholderText(NAME).props.value).toBe("Dave");
  });

  it("follows a location changed on another screen, without a reload", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    // What the Calendar tab's "Change" does: the shared profile gets a new location.
    mockCurrentUser = { ...baseUser, location: "Sacramento, CA" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText(LOCATION).props.value).toBe("Sacramento, CA");
  });

  it("follows a display name changed elsewhere too", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    mockCurrentUser = { ...baseUser, displayName: "David" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText(NAME).props.value).toBe("David");
  });

  it("keeps what the player is typing even if the profile changes underneath", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Spar");
    mockCurrentUser = { ...baseUser, location: "Sacramento, CA" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText(LOCATION).props.value).toBe("Spar");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("saves a new location to the shared profile when the field loses focus", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "  Sparks, NV ");
    await fireEvent(getByPlaceholderText(LOCATION), "blur");

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ userId: "user-1", patch: { location: "Sparks, NV" } });
    expect(mockShowToast).toHaveBeenCalledWith("Location updated", expect.stringContaining("Sparks, NV"));
  });

  it("saves when Done is pressed on the keyboard", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Sacramento, CA");
    await fireEvent(getByPlaceholderText(LOCATION), "submitEditing");

    expect(mockUpdateProfile).toHaveBeenCalledWith({ userId: "user-1", patch: { location: "Sacramento, CA" } });
  });

  it("saves when the player leaves the tab with the field still focused", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Sacramento, CA");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockLeaveTab).toBeDefined();
    await leaveTab();

    expect(mockUpdateProfile).toHaveBeenCalledWith({ userId: "user-1", patch: { location: "Sacramento, CA" } });
  });

  it("goes back to following the shared profile once it has saved", async () => {
    const { getByPlaceholderText, rerender } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Sparks, NV");
    await fireEvent(getByPlaceholderText(LOCATION), "blur");
    mockCurrentUser = { ...baseUser, location: "Carson City, NV" };
    await rerender(<ProfileScreen />);

    expect(getByPlaceholderText(LOCATION).props.value).toBe("Carson City, NV");
  });

  it("makes no request when the text matches what is already saved", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), " Reno, NV ");
    await fireEvent(getByPlaceholderText(LOCATION), "blur");

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("makes no request when a field is only tapped into and out of", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent(getByPlaceholderText(LOCATION), "blur");
    await leaveTab();

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("refuses a location too short to look up, and shows the saved one again", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "R");
    await fireEvent(getByPlaceholderText(LOCATION), "blur");

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(getByPlaceholderText(LOCATION).props.value).toBe("Reno, NV");
    expect(mockShowToast).toHaveBeenCalledWith("Location not changed", expect.any(String));
  });

  it("saves a new display name on its own, without touching the location", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(NAME), "David");
    await fireEvent(getByPlaceholderText(NAME), "blur");

    expect(mockUpdateProfile).toHaveBeenCalledWith({ userId: "user-1", patch: { displayName: "David" } });
    expect(mockShowToast).toHaveBeenCalledWith("Name updated", undefined);
  });

  it("clears the display name when it is emptied", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(NAME), "   ");
    await fireEvent(getByPlaceholderText(NAME), "blur");

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    const sent = mockUpdateProfile.mock.calls[0][0] as { patch: Record<string, unknown> };
    expect("displayName" in sent.patch).toBe(true);
    expect(sent.patch.displayName).toBeUndefined();
  });

  it("saves both fields in one request when both were edited before leaving the tab", async () => {
    const { getByPlaceholderText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(NAME), "David");
    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Sparks, NV");
    await leaveTab();

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      userId: "user-1",
      patch: { displayName: "David", location: "Sparks, NV" },
    });
  });

  it("needs no Save Changes button for the name and location", async () => {
    const { getByPlaceholderText, queryByText } = await render(<ProfileScreen />);

    await fireEvent.changeText(getByPlaceholderText(LOCATION), "Sparks, NV");

    expect(queryByText("Save Changes")).toBeNull();
    expect(queryByText(/unsaved changes/)).toBeNull();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<ProfileScreen />);

    expect(toJSON()).toBeNull();
  });
});

describe("ProfileScreen change-password form", () => {
  const CURRENT = "Current password";
  const NEW = "New password (min. 10 characters)";
  const CONFIRM = "Confirm new password";

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { ...baseUser };
    mockUpdatePassword.mockResolvedValue(undefined);
  });

  const openForm = async () => {
    const screen = await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText("Change Password"));
    return screen;
  };

  it("asks for the current password as well as the new one", async () => {
    const { getByPlaceholderText } = await openForm();

    expect(getByPlaceholderText(CURRENT).props.secureTextEntry).toBe(true);
    expect(getByPlaceholderText(NEW)).toBeTruthy();
    expect(getByPlaceholderText(CONFIRM)).toBeTruthy();
  });

  it("sends nothing without the current password", async () => {
    const { getByPlaceholderText, getByText } = await openForm();

    await fireEvent.changeText(getByPlaceholderText(NEW), "new-password-22");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "new-password-22");
    await fireEvent.press(getByText("Update Password"));

    expect(getByText("Enter your current password.")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("sends nothing when the new password is too short or the two do not match", async () => {
    const { getByPlaceholderText, getByText } = await openForm();

    await fireEvent.changeText(getByPlaceholderText(CURRENT), "old-password-1");
    await fireEvent.changeText(getByPlaceholderText(NEW), "short");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "short");
    await fireEvent.press(getByText("Update Password"));
    expect(getByText("Password must be at least 10 characters.")).toBeTruthy();

    await fireEvent.changeText(getByPlaceholderText(NEW), "new-password-22");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "new-password-23");
    await fireEvent.press(getByText("Update Password"));
    expect(getByText("Passwords do not match.")).toBeTruthy();

    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("passes both passwords on, then clears every field", async () => {
    const { getByPlaceholderText, getByText } = await openForm();

    await fireEvent.changeText(getByPlaceholderText(CURRENT), "old-password-1");
    await fireEvent.changeText(getByPlaceholderText(NEW), "new-password-22");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "new-password-22");
    await act(async () => {
      await fireEvent.press(getByText("Update Password"));
    });

    expect(mockUpdatePassword).toHaveBeenCalledWith("old-password-1", "new-password-22");
    expect(getByText("Password updated.")).toBeTruthy();
    expect(getByPlaceholderText(CURRENT).props.value).toBe("");
    expect(getByPlaceholderText(NEW).props.value).toBe("");
    expect(getByPlaceholderText(CONFIRM).props.value).toBe("");
  });

  it("says so when the current password is wrong, and keeps what was typed", async () => {
    mockUpdatePassword.mockRejectedValue(new Error("Your current password is not right."));
    const { getByPlaceholderText, getByText, queryByText } = await openForm();

    await fireEvent.changeText(getByPlaceholderText(CURRENT), "wrong-password");
    await fireEvent.changeText(getByPlaceholderText(NEW), "new-password-22");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "new-password-22");
    await act(async () => {
      await fireEvent.press(getByText("Update Password"));
    });

    expect(getByText("Your current password is not right.")).toBeTruthy();
    expect(queryByText("Password updated.")).toBeNull();
    expect(getByPlaceholderText(NEW).props.value).toBe("new-password-22");
  });

  it("does not show a database error to the player", async () => {
    mockUpdatePassword.mockRejectedValue({ code: "42501", message: "permission denied for table users" });
    const { getByPlaceholderText, getByText, queryByText } = await openForm();

    await fireEvent.changeText(getByPlaceholderText(CURRENT), "old-password-1");
    await fireEvent.changeText(getByPlaceholderText(NEW), "new-password-22");
    await fireEvent.changeText(getByPlaceholderText(CONFIRM), "new-password-22");
    await act(async () => {
      await fireEvent.press(getByText("Update Password"));
    });

    expect(getByText("Could not change password. Please try again.")).toBeTruthy();
    expect(queryByText(/permission denied/)).toBeNull();
  });
});