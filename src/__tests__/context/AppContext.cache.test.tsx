import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Text } from "react-native";
import { AppProvider, useApp } from "../../context/AppContext";

// Who is signed in, as AppProvider sees it. Tests change it and re-render.
let mockSession: { user: { id: string } } | null = null;
jest.mock("../../hooks/useAuthSession", () => ({
  useAuthSession: () => ({ session: mockSession, authLoading: false }),
}));
jest.mock("../../hooks/useProfileQueries", () => ({
  profileKeys: { detail: (id: string | undefined) => ["profile", id] },
  useProfileQuery: () => ({ data: null, isLoading: false }),
  useUpdateProfileMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock("../../hooks/useGroupQueries", () => ({
  useGroupsQuery: () => ({ data: [], isLoading: false }),
}));
const mockResetQueries = jest.fn();
const mockQueryClient = { removeQueries: jest.fn(), resetQueries: mockResetQueries };
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));
const mockClearCachedPlayerData = jest.fn();
jest.mock("../../lib/query-client", () => ({
  clearCachedPlayerData: (client: unknown) => mockClearCachedPlayerData(client),
}));
jest.mock("../../lib/supabase", () => ({
  registerSupabaseAutoRefresh: jest.fn(),
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock("../../lib/profile-api", () => ({
  fetchProfilesByIds: jest.fn(async () => []),
  fetchRivalCandidates: jest.fn(async () => []),
  fetchRivaledBy: jest.fn(async () => []),
}));

function Probe() {
  useApp();
  return <Text>ok</Text>;
}
const tree = () => (
  <AppProvider>
    <Probe />
  </AppProvider>
);
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

// Whatever is cached for a player must not be left for the next person on the same device.
describe("AppProvider and the cache when the signed-in player changes", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession = null;
    await AsyncStorage.clear();
  });

  it("clears nothing when the app starts signed out", async () => {
    await render(tree());
    await settle();
    expect(mockClearCachedPlayerData).not.toHaveBeenCalled();
    expect(mockResetQueries).not.toHaveBeenCalled();
  });

  it("clears nothing when a player signs in", async () => {
    const view = await render(tree());
    await settle();
    mockSession = { user: { id: "user-a" } };
    await view.rerender(tree());
    await settle();
    expect(mockClearCachedPlayerData).not.toHaveBeenCalled();
    expect(mockResetQueries).not.toHaveBeenCalled();
  });

  it("clears the whole cache when the player's session goes away", async () => {
    mockSession = { user: { id: "user-a" } };
    const view = await render(tree());
    await settle();
    mockSession = null;
    await view.rerender(tree());
    await settle();
    expect(mockClearCachedPlayerData).toHaveBeenCalledTimes(1);
    expect(mockClearCachedPlayerData).toHaveBeenCalledWith(mockQueryClient);
  });

  it("does not clear again on later renders while signed out", async () => {
    mockSession = { user: { id: "user-a" } };
    const view = await render(tree());
    await settle();
    mockSession = null;
    await view.rerender(tree());
    await view.rerender(tree());
    await settle();
    expect(mockClearCachedPlayerData).toHaveBeenCalledTimes(1);
  });

  it("drops the old answers when one account is replaced directly by another", async () => {
    mockSession = { user: { id: "user-a" } };
    const view = await render(tree());
    await settle();
    mockSession = { user: { id: "user-b" } };
    await view.rerender(tree());
    await settle();
    expect(mockResetQueries).toHaveBeenCalledTimes(1);
    expect(mockClearCachedPlayerData).not.toHaveBeenCalled();
  });

  it("does nothing when the same player's session is simply refreshed", async () => {
    mockSession = { user: { id: "user-a" } };
    const view = await render(tree());
    await settle();
    mockSession = { user: { id: "user-a" } };
    await view.rerender(tree());
    await settle();
    expect(mockClearCachedPlayerData).not.toHaveBeenCalled();
    expect(mockResetQueries).not.toHaveBeenCalled();
  });
});
