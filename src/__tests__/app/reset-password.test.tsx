import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import ResetPassword from "../../app/reset-password";

jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ theme: "dark" }),
}));

let mockParams: Record<string, string | undefined> = {};
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

const mockShowToast = jest.fn();
jest.mock("../../components/AppToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

const mockStart = jest.fn<(code: string) => Promise<void>>(() => Promise.resolve());
const mockSetNew = jest.fn<(password: string) => Promise<void>>(() => Promise.resolve());
jest.mock("../../lib/auth-api", () => ({
  MIN_PASSWORD_LENGTH: 10,
  startPasswordReset: (code: string) => mockStart(code),
  setNewPassword: (password: string) => mockSetNew(password),
}));

describe("ResetPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { code: "abc123" };
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("signs in with the link's code once, then shows the new-password form", async () => {
    const { findByTestId } = await render(<ResetPassword />);

    expect(await findByTestId("reset-password-new")).toBeTruthy();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith("abc123");
  });

  it("saves a valid new password and goes into the app", async () => {
    const { findByTestId, getByTestId } = await render(<ResetPassword />);

    await fireEvent.changeText(await findByTestId("reset-password-new"), "brand-new-pass");
    await fireEvent.changeText(getByTestId("reset-password-confirm"), "brand-new-pass");
    await fireEvent.press(getByTestId("reset-password-save"));

    await waitFor(() => expect(mockSetNew).toHaveBeenCalledWith("brand-new-pass"));
    expect(mockShowToast).toHaveBeenCalledWith("Password changed", expect.any(String));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("refuses a short password before sending anything", async () => {
    const { findByTestId, getByTestId, getByText } = await render(<ResetPassword />);

    await fireEvent.changeText(await findByTestId("reset-password-new"), "short");
    await fireEvent.changeText(getByTestId("reset-password-confirm"), "short");
    await fireEvent.press(getByTestId("reset-password-save"));

    expect(getByText(/at least 10 characters/i)).toBeTruthy();
    expect(mockSetNew).not.toHaveBeenCalled();
  });

  it("refuses two passwords that don't match", async () => {
    const { findByTestId, getByTestId, getByText } = await render(<ResetPassword />);

    await fireEvent.changeText(await findByTestId("reset-password-new"), "brand-new-pass");
    await fireEvent.changeText(getByTestId("reset-password-confirm"), "brand-new-pas5");
    await fireEvent.press(getByTestId("reset-password-save"));

    expect(getByText(/do not match/i)).toBeTruthy();
    expect(mockSetNew).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and lets the player try again", async () => {
    mockSetNew.mockRejectedValueOnce(new Error("New password should be different from the old password."));
    const { findByTestId, getByTestId, findByText } = await render(<ResetPassword />);

    await fireEvent.changeText(await findByTestId("reset-password-new"), "brand-new-pass");
    await fireEvent.changeText(getByTestId("reset-password-confirm"), "brand-new-pass");
    await fireEvent.press(getByTestId("reset-password-save"));

    expect(await findByText(/different from the old password/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(getByTestId("reset-password-save")).toBeTruthy();
  });

  it("explains an expired or wrong-device link instead of showing the form", async () => {
    mockStart.mockRejectedValueOnce(new Error("invalid flow state"));
    const { findByTestId, queryByTestId } = await render(<ResetPassword />);

    expect(await findByTestId("reset-password-failed")).toBeTruthy();
    expect(queryByTestId("reset-password-new")).toBeNull();
  });

  it("does nothing with a link that has no code", async () => {
    mockParams = {};
    const { getByTestId } = await render(<ResetPassword />);

    expect(getByTestId("reset-password-failed")).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("does nothing with a link Supabase already refused", async () => {
    mockParams = { code: "abc123", error_description: "Email link is invalid or has expired" };
    const { getByTestId } = await render(<ResetPassword />);

    expect(getByTestId("reset-password-failed")).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
