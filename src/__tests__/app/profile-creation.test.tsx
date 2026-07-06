import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Session } from "@supabase/supabase-js";
import ProfileCreation from "../../app/profile-creation";
import type { UserProfile } from "../../data/types";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

let mockCurrentUser: UserProfile | null = null;
const mockSetCurrentUser = jest.fn();
const mockSetRivals = jest.fn();
const mockSetChosenRivalId = jest.fn();
const mockClearCurrentUser = jest.fn();
const mockSession = {
  user: { id: "user-1", email: "player@example.com" },
} as unknown as Session;

jest.mock("../../context/AppContext", () => ({
  useApp: () => ({
    session: mockSession,
    currentUser: mockCurrentUser,
    setCurrentUser: mockSetCurrentUser,
    setRivals: mockSetRivals,
    setChosenRivalId: mockSetChosenRivalId,
    clearCurrentUser: mockClearCurrentUser,
  }),
}));

const mockCreatedProfile: UserProfile = {
  id: "user-1",
  username: "TestPlayer",
  location: "Nearby",
  games: ["mtg"],
  preferredFormats: {},
  brackets: [2],
  noGo: [],
  wins: 0,
  losses: 0,
  points: 0,
  monthlyPoints: 0,
};

const mockMutateAsync = jest.fn<
  (vars: { userId: string; draft: unknown }) => Promise<UserProfile>
>(() => Promise.resolve(mockCreatedProfile));
jest.mock("../../hooks/useProfileQueries", () => ({
  useCreateProfileMutation: () => ({
    mutateAsync: (vars: { userId: string; draft: unknown }) => mockMutateAsync(vars),
  }),
}));

const mockFindRivals = jest.fn();
jest.mock("../../utils/rival-utils", () => ({
  findRivals: (...args: unknown[]) => mockFindRivals(...args),
}));

const fillIdentityAndGames = async (getByTestId: (id: string) => any) => {
  await fireEvent.changeText(getByTestId("profile-creation-username-input"), "TestPlayer");
  await fireEvent.press(getByTestId("profile-creation-next-button")); // step 0 -> step 1
  await fireEvent.press(getByTestId("profile-creation-game-mtg")); // select a game
  await fireEvent.press(getByTestId("profile-creation-next-button")); // step 1 -> step 2
};

describe("ProfileCreation", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentUser = null;
    mockMutateAsync.mockResolvedValue(mockCreatedProfile);
    await AsyncStorage.clear();
  });

  // Regression test for the repeated "Choose Your Rival" dead end: when there are no rival
  // candidates, the reveal step (whose Continue button can never be enabled without a pick)
  // must never render, and the user must eventually land in the tabs rather than bouncing back
  // to a blank step 0 (the earlier bug this covers, caused by navigating before currentUser had
  // propagated through AppContext).
  it("skips the rival-reveal step and enters the tabs once currentUser catches up, when there are no rivals", async () => {
    mockFindRivals.mockReturnValue([]);
    const { getByTestId, queryByText, rerender } = await render(<ProfileCreation />);

    await fillIdentityAndGames(getByTestId);
    await fireEvent.press(getByTestId("profile-creation-next-button")); // submit profile

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ userId: "user-1", draft: expect.anything() });
    });

    // Must never show the dead-end reveal step.
    expect(queryByText("Choose Your Rival")).toBeNull();
    expect(queryByText("Pick Your Rival First")).toBeNull();

    // currentUser hasn't propagated through AppContext yet - must NOT navigate prematurely
    // (this is the exact race that used to bounce the user back to a blank step 0).
    expect(mockReplace).not.toHaveBeenCalled();

    // Simulate AppContext's own re-render supplying the now-created profile.
    mockCurrentUser = mockCreatedProfile;
    await rerender(<ProfileCreation />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
    });
  });

  it("shows the rival-reveal step when rivals are found, instead of skipping it", async () => {
    mockFindRivals.mockReturnValue([{ ...mockCreatedProfile, id: "rival-1", username: "Rival" }]);
    const { getByTestId, getByText } = await render(<ProfileCreation />);

    await fillIdentityAndGames(getByTestId);
    await fireEvent.press(getByTestId("profile-creation-next-button"));

    await waitFor(() => {
      expect(getByText("Choose Your Rival")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // Regression test for the profile-creation dead end where a session with no reachable profile
  // (e.g. the row was deleted directly in the database) had no way back to /sign-in at all.
  it("signs out and navigates to /sign-in when the Sign Out link is pressed", async () => {
    const { getByTestId } = await render(<ProfileCreation />);

    await fireEvent.press(getByTestId("profile-creation-sign-out"));

    expect(mockClearCurrentUser).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
  });
});
