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
    setRivals: mockSetRivals,
    setChosenRivalId: mockSetChosenRivalId,
    clearCurrentUser: mockClearCurrentUser,
    theme: "dark",
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
  draws: 0,
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

const mockFetchRivalCandidates = jest.fn<() => Promise<UserProfile[]>>(() => Promise.resolve([]));
const mockUpdateProfile = jest.fn<() => Promise<UserProfile>>(() => Promise.resolve(mockCreatedProfile));
jest.mock("../../lib/profile-api", () => ({
  fetchRivalCandidates: () => mockFetchRivalCandidates(),
  updateProfile: () => mockUpdateProfile(),
  UsernameTakenError: class UsernameTakenError extends Error {},
}));

const CITY_PLACEHOLDER = "City, State — e.g. Reno, NV";

const fillIdentityAndGames = async (
  getByTestId: (id: string) => any,
  getByPlaceholderText: (text: string) => any
) => {
  await fireEvent.changeText(getByTestId("profile-creation-username-input"), "TestPlayer");
  await fireEvent.changeText(getByPlaceholderText(CITY_PLACEHOLDER), "Reno, NV");
  // The app is Commander-only for now, so the game step is skipped: identity leads straight to
  // preferences with Magic and Commander already set.
  await fireEvent.press(getByTestId("profile-creation-next-button")); // identity -> preferences
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
    const { getByTestId, getByPlaceholderText, queryByText, rerender } = await render(<ProfileCreation />);

    await fillIdentityAndGames(getByTestId, getByPlaceholderText);
    await fireEvent.press(getByTestId("profile-creation-next-button")); // submit profile

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        userId: "user-1",
        draft: expect.objectContaining({
          location: "Reno, NV",
          games: ["mtg"],
          preferredFormats: { mtg: ["Commander"] },
        }),
      });
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
    const { getByTestId, getByPlaceholderText, getByText } = await render(<ProfileCreation />);

    await fillIdentityAndGames(getByTestId, getByPlaceholderText);
    await fireEvent.press(getByTestId("profile-creation-next-button"));

    await waitFor(() => {
      expect(getByText("Choose Your Rival")).toBeTruthy();
    });
    expect(getByText(/Rivals are players who play the same games as you/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("lets a player skip picking a rival and still enter the app", async () => {
    mockFindRivals.mockReturnValue([{ ...mockCreatedProfile, id: "rival-1", username: "Rival" }]);
    const { getByTestId, getByPlaceholderText, rerender } = await render(<ProfileCreation />);

    await fillIdentityAndGames(getByTestId, getByPlaceholderText);
    await fireEvent.press(getByTestId("profile-creation-next-button"));
    await waitFor(() => {
      expect(getByTestId("profile-creation-skip-rival")).toBeTruthy();
    });

    await fireEvent.press(getByTestId("profile-creation-skip-rival"));
    mockCurrentUser = mockCreatedProfile;
    await rerender(<ProfileCreation />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
    });
    expect(mockSetChosenRivalId).not.toHaveBeenCalled();
  });

  // A blank city used to be saved as "Nearby", which the Calendar tab could never look up.
  it("will not leave the first step without a city", async () => {
    const { getByTestId, getByPlaceholderText, getByText, queryByText } = await render(<ProfileCreation />);

    await fireEvent.changeText(getByTestId("profile-creation-username-input"), "TestPlayer");
    await fireEvent.press(getByTestId("profile-creation-next-button"));
    expect(getByText("Create Your Profile")).toBeTruthy();
    expect(queryByText("Your Preferences")).toBeNull();

    await fireEvent.changeText(getByPlaceholderText(CITY_PLACEHOLDER), " R ");
    await fireEvent.press(getByTestId("profile-creation-next-button"));
    expect(queryByText("Your Preferences")).toBeNull();

    await fireEvent.changeText(getByPlaceholderText(CITY_PLACEHOLDER), "Reno, NV");
    await fireEvent.press(getByTestId("profile-creation-next-button"));
    expect(getByText("Your Preferences")).toBeTruthy();
  });

  it("never asks which game or format, and shows only Commander's own settings", async () => {
    const { getByTestId, getByPlaceholderText, getByText, queryByText, queryByTestId } = await render(
      <ProfileCreation />
    );

    await fillIdentityAndGames(getByTestId, getByPlaceholderText);

    expect(getByText("Your Preferences")).toBeTruthy();
    expect(queryByText("What Do You Play?")).toBeNull();
    for (const game of ["mtg", "pokemon", "lorcana", "onepiece"]) {
      expect(queryByTestId(`profile-creation-game-${game}`)).toBeNull();
    }
    for (const hidden of [/Formats$/, "Standard", "Draft", "Modern", "Pioneer", /Pokémon/, /Lorcana/, /One Piece/]) {
      expect(queryByText(hidden)).toBeNull();
    }
    expect(getByText("⚔️ Commander Bracket")).toBeTruthy();
  });

  it("goes back a step without losing what was entered", async () => {
    const { getByTestId, getByPlaceholderText, getByText, queryByTestId } = await render(<ProfileCreation />);

    expect(queryByTestId("profile-creation-back-button")).toBeNull();
    await fillIdentityAndGames(getByTestId, getByPlaceholderText);
    expect(getByText("Your Preferences")).toBeTruthy();

    await fireEvent.press(getByTestId("profile-creation-back-button"));
    expect(getByText("Create Your Profile")).toBeTruthy();
    expect(getByTestId("profile-creation-username-input").props.value).toBe("TestPlayer");
    expect(queryByTestId("profile-creation-back-button")).toBeNull();
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
