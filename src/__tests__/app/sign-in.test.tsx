import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import SignIn from "../../app/sign-in";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockNotificationAsync = jest.fn();
const mockSelectionAsync = jest.fn();
jest.mock("expo-haptics", () => ({
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  selectionAsync: (...args: unknown[]) => mockSelectionAsync(...args),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

const mockSignUpWithEmail = jest.fn<(email: string, password: string) => Promise<void>>(
  () => Promise.resolve()
);
const mockSignInWithEmail = jest.fn<(email: string, password: string) => Promise<void>>(
  () => Promise.resolve()
);
jest.mock("../../lib/auth-api", () => ({
  signUpWithEmail: (email: string, password: string) => mockSignUpWithEmail(email, password),
  signInWithEmail: (email: string, password: string) => mockSignInWithEmail(email, password),
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
}));

describe("SignIn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Regression test: typing an email with no "@"/no extension used to just leave the submit
  // button silently disabled with no explanation - no error text, no haptic, nothing visible.
  it("shows a red inline error and an error haptic for an invalid email, and never calls Supabase", async () => {
    const { getByTestId, getByText, queryByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "not-a-valid-email");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    expect(getByText(/enter a valid email address/i)).toBeTruthy();
    expect(mockNotificationAsync).toHaveBeenCalledWith("error");
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryByText(/couldn't save|something went wrong/i)).toBeNull();
  });

  it("shows a red inline error for a too-short password and never calls Supabase", async () => {
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    expect(getByText(/at least 6 characters/i)).toBeTruthy();
    expect(mockNotificationAsync).toHaveBeenCalledWith("error");
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();
  });

  it("clears the field error as soon as the user edits that field again", async () => {
    const { getByTestId, getByText, queryByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "not-a-valid-email");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));
    expect(getByText(/enter a valid email address/i)).toBeTruthy();

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "still-typing");
    expect(queryByText(/enter a valid email address/i)).toBeNull();
  });

  it("submits a valid sign-in and navigates to '/' on success (default mode, no toggle needed)", async () => {
    const { getByTestId } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "  player@example.com  ");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith("player@example.com", "password123");
    });
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("submits sign-up (not sign-in) once the mode has been toggled", async () => {
    const { getByTestId } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    expect(mockSelectionAsync).toHaveBeenCalled();

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith("player@example.com", "password123");
    });
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it("shows a generic error message and does not navigate when Supabase rejects", async () => {
    mockSignInWithEmail.mockRejectedValueOnce(new Error("Invalid login credentials."));
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(getByText("Invalid login credentials.")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows 'Welcome Back to PlayLink' in sign-in mode and switches copy in sign-up mode", async () => {
    const { getByText, getByTestId } = await render(<SignIn />);

    expect(getByText("Welcome Back to PlayLink")).toBeTruthy();

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    expect(getByText("Welcome to PlayLink!")).toBeTruthy();
  });

  it("toggles password visibility when the eye icon is pressed", async () => {
    const { getByTestId } = await render(<SignIn />);

    const passwordInput = getByTestId("sign-in-password-input");
    expect(passwordInput.props.secureTextEntry).toBe(true);

    await fireEvent.press(getByTestId("sign-in-password-toggle"));
    expect(passwordInput.props.secureTextEntry).toBe(false);

    await fireEvent.press(getByTestId("sign-in-password-toggle"));
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });
});
