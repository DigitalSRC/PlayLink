import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { showToast, TOAST_DURATION_MS, ToastHost } from "../../components/AppToast";

jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ theme: "dark" }),
}));

// Raising a toast updates the mounted host, so it has to happen inside act().
const raise = (...args: Parameters<typeof showToast>) =>
  act(async () => {
    showToast(...args);
  });
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe("showToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing, and does not throw, when no ToastHost is mounted", () => {
    expect(() => showToast("Group posted!")).not.toThrow();
  });

  it("is not shown later by a host that mounts after it was dropped", async () => {
    showToast("Dropped");
    const { queryByText } = await render(<ToastHost />);

    expect(queryByText("Dropped")).toBeNull();
  });

  it("shows the title and message", async () => {
    const { getByText, queryByText } = await render(<ToastHost />);
    expect(queryByText("Group posted!")).toBeNull();

    await raise("Group posted!", "Join code ABC234.");

    expect(getByText("Group posted!")).toBeTruthy();
    expect(getByText("Join code ABC234.")).toBeTruthy();
    await advance(TOAST_DURATION_MS);
  });

  it("closes by itself after a few seconds, with nothing pressed", async () => {
    const { getByText, queryByText } = await render(<ToastHost />);

    await raise("Profile saved");
    await advance(TOAST_DURATION_MS - 1);
    expect(getByText("Profile saved")).toBeTruthy();

    await advance(1);
    expect(queryByText("Profile saved")).toBeNull();
  });

  it("closes at once when the screen is tapped", async () => {
    const { getByLabelText, queryByText } = await render(<ToastHost />);

    await raise("You’re in!");
    await fireEvent.press(getByLabelText("You’re in!. Tap to dismiss"));

    expect(queryByText("You’re in!")).toBeNull();
  });

  it("shows queued toasts one after another, each for its full time", async () => {
    const { getByText, queryByText } = await render(<ToastHost />);

    await raise("Group posted!");
    await raise("+25 points");

    expect(getByText("Group posted!")).toBeTruthy();
    expect(queryByText("+25 points")).toBeNull();

    await advance(TOAST_DURATION_MS);
    expect(queryByText("Group posted!")).toBeNull();
    expect(getByText("+25 points")).toBeTruthy();

    await advance(TOAST_DURATION_MS - 1);
    expect(getByText("+25 points")).toBeTruthy();
    await advance(1);
    expect(queryByText("+25 points")).toBeNull();
  });

  it("moves straight to the next toast when the first is tapped away", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<ToastHost />);

    await raise("Group posted!");
    await raise("+25 points");
    await fireEvent.press(getByLabelText("Group posted!. Tap to dismiss"));

    expect(queryByText("Group posted!")).toBeNull();
    expect(getByText("+25 points")).toBeTruthy();
    await advance(TOAST_DURATION_MS);
  });
});
