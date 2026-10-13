import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ReactNode } from "react";
import RootLayout from "../../app/_layout";

// Records which screens were listed under which guard, in place of the real navigator.
const mockGuards: { guard: boolean; screens: string[] }[] = [];
let mockStatus = "ready";

jest.mock("expo-router", () => {
  const React = require("react");
  const Screen = (_props: { name: string }) => null;
  const Protected = ({ guard, children }: { guard: boolean; children?: ReactNode }) => {
    const screens = React.Children.toArray(children).map((child: { props: { name: string } }) => child.props.name);
    mockGuards.push({ guard, screens });
    return null;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <>{children}</>;
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { Stack };
});

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock("@tanstack/react-query-persist-client", () => ({
  PersistQueryClientProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock("../../lib/query-client", () => ({
  persister: {},
  queryClient: {},
  registerAppFocusRefresh: jest.fn(),
}));
jest.mock("../../context/AppContext", () => ({
  AppProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useApp: () => ({ theme: "dark" }),
}));
jest.mock("../../components/AppDialog", () => ({ DialogHost: () => null }));
jest.mock("../../components/AppToast", () => ({ ToastHost: () => null }));
jest.mock("../../utils/theme-utils", () => ({ useThemeColors: () => ({ bg: "#000" }) }));
jest.mock("../../utils/auth-status", () => ({ useAuthStatus: () => mockStatus }));

const guardFor = (screen: string): boolean => {
  const entry = mockGuards.find((g) => g.screens.includes(screen));
  if (!entry) throw new Error(`${screen} is not listed under any guard`);
  return entry.guard;
};

const renderWith = async (status: string) => {
  mockStatus = status;
  mockGuards.length = 0;
  await render(<RootLayout />);
};

describe("root layout route guard", () => {
  beforeEach(() => {
    mockGuards.length = 0;
  });

  it("opens every guarded screen to a signed-in player with a profile", async () => {
    await renderWith("ready");

    expect(guardFor("group-detail")).toBe(true);
    expect(guardFor("player-profile")).toBe(true);
    expect(guardFor("profile-creation")).toBe(true);
  });

  it("closes all three to a signed-out visitor", async () => {
    await renderWith("unauthenticated");

    expect(guardFor("group-detail")).toBe(false);
    expect(guardFor("player-profile")).toBe(false);
    expect(guardFor("profile-creation")).toBe(false);
  });

  it("lets a signed-in player with no profile reach onboarding and nothing else", async () => {
    await renderWith("no-profile");

    expect(guardFor("profile-creation")).toBe(true);
    expect(guardFor("group-detail")).toBe(false);
    expect(guardFor("player-profile")).toBe(false);
  });

  it("keeps the screens reachable while the sign-in status is still loading", async () => {
    // A link opened on a cold start must survive until the saved session has been read.
    await renderWith("loading");

    expect(guardFor("group-detail")).toBe(true);
    expect(guardFor("player-profile")).toBe(true);
    expect(guardFor("profile-creation")).toBe(true);
  });

  it("keeps onboarding open once the profile exists, for its rival-reveal step", async () => {
    await renderWith("ready");

    expect(guardFor("profile-creation")).toBe(true);
  });

  it("does not put sign-in or the start screen behind a guard", async () => {
    await renderWith("unauthenticated");

    const listed = mockGuards.flatMap((g) => g.screens);
    expect(listed).not.toContain("sign-in");
    expect(listed).not.toContain("index");
    expect(listed).not.toContain("(tabs)");
  });
});
