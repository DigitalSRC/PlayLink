import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NoRivalBanner } from "../../components/NoRivalBanner";

// What the banner reads from global context; each test sets it before rendering.
let mockApp: {
  theme: "dark";
  session: { user: { id: string } } | null;
  rivals: { id: string; username: string; displayName?: string }[];
  rivalsLoaded: boolean;
};
const mockShowToast = jest.fn();

jest.mock("../../context/AppContext", () => ({
  useApp: () => mockApp,
}));
jest.mock("../../components/AppToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

const TITLE = "You don't have a Rival yet";
const CLOSE = "Close the no Rival warning";

// The banner remembers which accounts closed it in module state for the whole launch, which a
// test cannot reset without loading a second React. So every test signs in a different account.
let accountSeq = 0;

describe("NoRivalBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApp = { theme: "dark", session: { user: { id: `player-${++accountSeq}` } }, rivals: [], rivalsLoaded: true };
  });

  it("warns when the rival lookup has finished and found none", async () => {
    const { getByText } = await render(<NoRivalBanner />);

    expect(getByText(TITLE)).toBeTruthy();
  });

  it("shows nothing while rivals are still loading", async () => {
    mockApp.rivalsLoaded = false;
    const { queryByText } = await render(<NoRivalBanner />);

    expect(queryByText(TITLE)).toBeNull();
  });

  it("shows nothing when the player has a rival", async () => {
    mockApp.rivals = [{ id: "r1", username: "dillon" }];
    const { queryByText } = await render(<NoRivalBanner />);

    expect(queryByText(TITLE)).toBeNull();
  });

  it("shows nothing when signed out", async () => {
    mockApp.session = null;
    const { queryByText } = await render(<NoRivalBanner />);

    expect(queryByText(TITLE)).toBeNull();
  });

  it("does not close when the warning itself is tapped - only the x closes it", async () => {
    const { getByText, queryByText, getByLabelText } = await render(<NoRivalBanner />);

    await fireEvent.press(getByText(TITLE));
    expect(getByText(TITLE)).toBeTruthy();

    await fireEvent.press(getByLabelText(CLOSE));
    expect(queryByText(TITLE)).toBeNull();
  });

  it("stays closed for the rest of this launch, even after being mounted again", async () => {
    const first = await render(<NoRivalBanner />);
    await fireEvent.press(first.getByLabelText(CLOSE));
    await first.unmount();

    const second = await render(<NoRivalBanner />);
    expect(second.queryByText(TITLE)).toBeNull();
  });

  it("is closed per account, so another account on this device still sees it", async () => {
    const view = await render(<NoRivalBanner />);
    await fireEvent.press(view.getByLabelText(CLOSE));

    mockApp = { ...mockApp, session: { user: { id: "someone-else" } } };
    await view.rerender(<NoRivalBanner />);
    expect(view.getByText(TITLE)).toBeTruthy();
  });

  it("goes away and names the rival when one turns up", async () => {
    const view = await render(<NoRivalBanner />);

    mockApp = { ...mockApp, rivals: [{ id: "r1", username: "dillon", displayName: "Dillon" }] };
    await view.rerender(<NoRivalBanner />);

    expect(view.queryByText(TITLE)).toBeNull();
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("You have a Rival!", "Dillon is your Rival now. See them on Home.");
  });

  it("does not announce rivals the player already had when the app opened", async () => {
    mockApp.rivals = [{ id: "r1", username: "dillon" }];
    const view = await render(<NoRivalBanner />);
    await view.rerender(<NoRivalBanner />);

    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("falls back to the username when the rival has no display name", async () => {
    const view = await render(<NoRivalBanner />);

    mockApp = { ...mockApp, rivals: [{ id: "r1", username: "dillon" }] };
    await view.rerender(<NoRivalBanner />);

    expect(mockShowToast).toHaveBeenCalledWith("You have a Rival!", "dillon is your Rival now. See them on Home.");
  });
});
