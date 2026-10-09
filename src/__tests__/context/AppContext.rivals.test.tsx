import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";
import { AppProvider, useApp } from "../../context/AppContext";
import { UserProfile } from "../../data/types";
import { RIVAL_SEARCH_INTERVAL_MS } from "../../utils/rival-utils";

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: "me",
  username: "me",
  location: "Anywhere",
  games: ["mtg"],
  preferredFormats: { mtg: ["Commander"] },
  brackets: [2],
  noGo: [],
  wins: 0,
  losses: 0,
  draws: 0,
  points: 0,
  monthlyPoints: 0,
  pointBalance: 0,
  rivalIds: [],
  ...overrides,
});

// The signed-in player's profile, as the profile query returns it.
let mockProfile: UserProfile | null = null;
let mockSession: { user: { id: string } } | null = null;
const mockUpdate = jest.fn<(vars: { userId: string; patch: Partial<UserProfile> }) => Promise<unknown>>();
const mockFetchByIds = jest.fn<(ids: string[]) => Promise<UserProfile[]>>();
const mockFetchCandidates = jest.fn<(excludeUserId: string) => Promise<UserProfile[]>>();

jest.mock("../../hooks/useAuthSession", () => ({
  useAuthSession: () => ({ session: mockSession, authLoading: false }),
}));
jest.mock("../../hooks/useProfileQueries", () => ({
  profileKeys: { detail: (id: string | undefined) => ["profile", id] },
  useProfileQuery: () => ({ data: mockProfile, isLoading: false }),
  useUpdateProfileMutation: () => ({ mutate: jest.fn(), mutateAsync: mockUpdate }),
}));
jest.mock("../../hooks/useGroupQueries", () => ({
  useGroupsQuery: () => ({ data: [], isLoading: false }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: jest.fn() }),
}));
jest.mock("../../lib/supabase", () => ({
  registerSupabaseAutoRefresh: jest.fn(),
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock("../../lib/profile-api", () => ({
  fetchProfilesByIds: (ids: string[]) => mockFetchByIds(ids),
  fetchRivalCandidates: (id: string) => mockFetchCandidates(id),
}));

function Probe() {
  const { rivals, rivalsLoaded, refreshRivals, clearCurrentUser } = useApp();
  return (
    <>
      <Text testID="loaded">{String(rivalsLoaded)}</Text>
      <Text testID="rivals">{rivals.map((r) => r.id).join(",")}</Text>
      <Pressable testID="refresh" onPress={() => refreshRivals()} />
      <Pressable testID="sign-out" onPress={clearCurrentUser} />
    </>
  );
}

const tree = () => (
  <AppProvider>
    <Probe />
  </AppProvider>
);
const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

const rival = makeProfile({ id: "rival-1", username: "dillon" });

describe("AppProvider rivals", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSession = { user: { id: "me" } };
    mockProfile = makeProfile();
    mockUpdate.mockResolvedValue(undefined);
    mockFetchByIds.mockResolvedValue([]);
    mockFetchCandidates.mockResolvedValue([]);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("loads the rivals the profile points at, and does not search when there are some", async () => {
    mockProfile = makeProfile({ rivalIds: ["rival-1"] });
    mockFetchByIds.mockResolvedValue([rival]);
    const { getByTestId } = await render(tree());

    await waitFor(() => expect(getByTestId("rivals").props.children).toBe("rival-1"));
    expect(getByTestId("loaded").props.children).toBe("true");
    expect(mockFetchByIds).toHaveBeenCalledWith(["rival-1"]);
    expect(mockFetchCandidates).not.toHaveBeenCalled();
  });

  it("with no rivals, searches for some and saves what it finds to the profile", async () => {
    mockFetchCandidates.mockResolvedValue([rival]);
    const { getByTestId } = await render(tree());

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(getByTestId("loaded").props.children).toBe("true");
    expect(mockFetchByIds).not.toHaveBeenCalled();
    expect(mockFetchCandidates).toHaveBeenCalledWith("me");
    expect(mockUpdate).toHaveBeenCalledWith({ userId: "me", patch: { rivalIds: ["rival-1"] } });
  });

  it("treats rivals whose accounts were all deleted as no rivals, and searches", async () => {
    mockProfile = makeProfile({ rivalIds: ["deleted-1", "deleted-2"] });
    mockFetchByIds.mockResolvedValue([]);
    mockFetchCandidates.mockResolvedValue([rival]);
    const { getByTestId } = await render(tree());

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(getByTestId("rivals").props.children).toBe("");
    expect(mockUpdate).toHaveBeenCalledWith({ userId: "me", patch: { rivalIds: ["rival-1"] } });
  });

  it("skips players who share no game with the player", async () => {
    mockFetchCandidates.mockResolvedValue([makeProfile({ id: "pk", games: ["pokemon"] })]);
    await render(tree());
    await settle();

    expect(mockFetchCandidates).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("finding nobody saves nothing, and it looks again every minute", async () => {
    jest.useFakeTimers();
    await render(tree());
    await settle();
    expect(mockFetchCandidates).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(RIVAL_SEARCH_INTERVAL_MS);
    });
    await settle();
    expect(mockFetchCandidates).toHaveBeenCalledTimes(2);

    mockFetchCandidates.mockResolvedValue([rival]);
    await act(async () => {
      jest.advanceTimersByTime(RIVAL_SEARCH_INTERVAL_MS);
    });
    await settle();
    expect(mockFetchCandidates).toHaveBeenCalledTimes(3);
    expect(mockUpdate).toHaveBeenCalledWith({ userId: "me", patch: { rivalIds: ["rival-1"] } });
  });

  it("logs a failed search instead of throwing, and tries again on the next tick", async () => {
    jest.useFakeTimers();
    mockFetchCandidates.mockRejectedValueOnce(new Error("offline"));
    await render(tree());
    await settle();
    expect(console.warn).toHaveBeenCalledWith("Rival search failed:", expect.any(Error));

    await act(async () => {
      jest.advanceTimersByTime(RIVAL_SEARCH_INTERVAL_MS);
    });
    await settle();
    expect(mockFetchCandidates).toHaveBeenCalledTimes(2);
  });

  it("does not claim the player has no rival when the rival lookup itself failed", async () => {
    mockProfile = makeProfile({ rivalIds: ["rival-1"] });
    mockFetchByIds.mockRejectedValue(new Error("offline"));
    const { getByTestId } = await render(tree());
    await settle();

    expect(getByTestId("loaded").props.children).toBe("false");
    expect(mockFetchCandidates).not.toHaveBeenCalled();
  });

  it("looks nothing up before the profile has loaded", async () => {
    mockProfile = null;
    const { getByTestId } = await render(tree());
    await settle();

    expect(getByTestId("loaded").props.children).toBe("false");
    expect(mockFetchByIds).not.toHaveBeenCalled();
    expect(mockFetchCandidates).not.toHaveBeenCalled();
  });

  it("refreshRivals looks the rivals up again", async () => {
    mockProfile = makeProfile({ rivalIds: ["rival-1"] });
    mockFetchByIds.mockResolvedValue([rival]);
    const { getByTestId } = await render(tree());
    await waitFor(() => expect(getByTestId("rivals").props.children).toBe("rival-1"));

    await fireEvent.press(getByTestId("refresh"));
    await settle();
    expect(mockFetchByIds).toHaveBeenCalledTimes(2);
    expect(mockFetchCandidates).not.toHaveBeenCalled();
  });

  it("refreshRivals searches straight away when the rivals have since been deleted", async () => {
    mockProfile = makeProfile({ rivalIds: ["rival-1"] });
    mockFetchByIds.mockResolvedValueOnce([rival]);
    const { getByTestId } = await render(tree());
    await waitFor(() => expect(getByTestId("rivals").props.children).toBe("rival-1"));

    mockFetchByIds.mockResolvedValue([]);
    mockFetchCandidates.mockResolvedValue([makeProfile({ id: "rival-2" })]);
    await fireEvent.press(getByTestId("refresh"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ userId: "me", patch: { rivalIds: ["rival-2"] } }));
  });

  it("forgets the rival state at sign-out", async () => {
    mockProfile = makeProfile({ rivalIds: ["rival-1"] });
    mockFetchByIds.mockResolvedValue([rival]);
    const { getByTestId } = await render(tree());
    await waitFor(() => expect(getByTestId("loaded").props.children).toBe("true"));

    await fireEvent.press(getByTestId("sign-out"));
    await settle();
    expect(getByTestId("rivals").props.children).toBe("");
    expect(getByTestId("loaded").props.children).toBe("false");
  });
});
