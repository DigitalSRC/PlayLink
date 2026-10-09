import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as ReactNative from "react-native";
import { Pressable, Text } from "react-native";
import { AppProvider, useApp } from "../../context/AppContext";

// Who is signed in, as AppProvider sees it.
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
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ removeQueries: jest.fn() }),
}));
const mockSignOut = jest.fn();
jest.mock("../../lib/supabase", () => ({
  registerSupabaseAutoRefresh: jest.fn(),
  supabase: { auth: { signOut: () => mockSignOut() } },
}));
jest.mock("../../lib/profile-api", () => ({ fetchProfilesByIds: jest.fn() }));

const THEME_KEY = "app-theme";

function Probe() {
  const { theme, setTheme, clearCurrentUser } = useApp();
  return (
    <>
      <Text testID="theme">{theme}</Text>
      <Pressable testID="pick-light" onPress={() => setTheme("light")} />
      <Pressable testID="pick-dark" onPress={() => setTheme("dark")} />
      <Pressable testID="sign-out" onPress={clearCurrentUser} />
    </>
  );
}

const tree = () => (
  <AppProvider>
    <Probe />
  </AppProvider>
);
// Lets the stored-theme read, and anything it triggers, finish.
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const setDevice = (scheme: "light" | "dark" | null) =>
  jest.spyOn(ReactNative, "useColorScheme").mockReturnValue(scheme as ReactNative.ColorSchemeName);

describe("AppProvider theme", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSession = null;
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("follows a light device when nobody is signed in and nothing is saved", async () => {
    setDevice("light");
    const { getByTestId } = await render(tree());
    await settle();

    expect(getByTestId("theme").props.children).toBe("light");
    expect(await AsyncStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("follows a dark device, and treats a device with no preference as dark", async () => {
    setDevice("dark");
    const dark = await render(tree());
    await settle();
    expect(dark.getByTestId("theme").props.children).toBe("dark");
    await dark.unmount();

    setDevice(null);
    const none = await render(tree());
    await settle();
    expect(none.getByTestId("theme").props.children).toBe("dark");
  });

  it("uses a saved choice over the device's setting", async () => {
    await AsyncStorage.setItem(THEME_KEY, "light");
    mockSession = { user: { id: "user-1" } };
    setDevice("dark");
    const { getByTestId } = await render(tree());

    await waitFor(() => expect(getByTestId("theme").props.children).toBe("light"));
  });

  it("ignores a saved value that is not a theme", async () => {
    await AsyncStorage.setItem(THEME_KEY, "sepia");
    setDevice("light");
    const { getByTestId } = await render(tree());
    await settle();

    expect(getByTestId("theme").props.children).toBe("light");
  });

  it("saves the device's setting as the choice once someone is signed in", async () => {
    mockSession = { user: { id: "user-1" } };
    setDevice("light");
    const { getByTestId } = await render(tree());

    await waitFor(async () => expect(await AsyncStorage.getItem(THEME_KEY)).toBe("light"));
    expect(getByTestId("theme").props.children).toBe("light");
  });

  it("keeps that saved choice when the device's setting changes later", async () => {
    mockSession = { user: { id: "user-1" } };
    setDevice("light");
    const { getByTestId, rerender } = await render(tree());
    await waitFor(async () => expect(await AsyncStorage.getItem(THEME_KEY)).toBe("light"));
    await settle();

    setDevice("dark");
    await rerender(tree());
    await settle();

    expect(getByTestId("theme").props.children).toBe("light");
  });

  it("saves a choice made on the Profile tab", async () => {
    mockSession = { user: { id: "user-1" } };
    setDevice("dark");
    const { getByTestId } = await render(tree());
    await settle();

    await fireEvent.press(getByTestId("pick-light"));

    expect(getByTestId("theme").props.children).toBe("light");
    await waitFor(async () => expect(await AsyncStorage.getItem(THEME_KEY)).toBe("light"));
  });

  it("forgets the choice at sign-out and goes back to the device's setting", async () => {
    await AsyncStorage.setItem(THEME_KEY, "light");
    mockSession = { user: { id: "user-1" } };
    setDevice("dark");
    const { getByTestId } = await render(tree());
    await waitFor(() => expect(getByTestId("theme").props.children).toBe("light"));

    await fireEvent.press(getByTestId("sign-out"));
    await settle();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(getByTestId("theme").props.children).toBe("dark");
    expect(await AsyncStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("does not save a theme again while the sign-out is still finishing", async () => {
    await AsyncStorage.setItem(THEME_KEY, "light");
    mockSession = { user: { id: "user-1" } };
    setDevice("dark");
    const { getByTestId, rerender } = await render(tree());
    await waitFor(() => expect(getByTestId("theme").props.children).toBe("light"));

    // The session is still there for a moment after sign-out is asked for.
    await fireEvent.press(getByTestId("sign-out"));
    await rerender(tree());
    await settle();
    expect(await AsyncStorage.getItem(THEME_KEY)).toBeNull();

    // Then it goes, and the signed-out screens keep following the device.
    mockSession = null;
    await rerender(tree());
    await settle();
    expect(await AsyncStorage.getItem(THEME_KEY)).toBeNull();
    setDevice("light");
    await rerender(tree());
    expect(getByTestId("theme").props.children).toBe("light");
  });

  it("saves the device's setting again for whoever signs in next", async () => {
    await AsyncStorage.setItem(THEME_KEY, "dark");
    mockSession = { user: { id: "user-1" } };
    setDevice("light");
    const { getByTestId, rerender } = await render(tree());
    await waitFor(() => expect(getByTestId("theme").props.children).toBe("dark"));

    await fireEvent.press(getByTestId("sign-out"));
    mockSession = null;
    await rerender(tree());
    await settle();
    expect(getByTestId("theme").props.children).toBe("light");

    mockSession = { user: { id: "user-2" } };
    await rerender(tree());

    await waitFor(async () => expect(await AsyncStorage.getItem(THEME_KEY)).toBe("light"));
    expect(getByTestId("theme").props.children).toBe("light");
  });
});
