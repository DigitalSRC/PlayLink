import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import SignIn from "../../app/sign-in";

// The screen takes its colors from the app's theme, which before sign-in is the device's setting.
let mockTheme: "dark" | "light" = "dark";
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ theme: mockTheme }),
}));

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
const mockRequestPasswordReset = jest.fn<(email: string) => Promise<void>>(() => Promise.resolve());
jest.mock("../../lib/auth-api", () => ({
  MIN_PASSWORD_LENGTH: 10,
  signUpWithEmail: (email: string, password: string) => mockSignUpWithEmail(email, password),
  signInWithEmail: (email: string, password: string) => mockSignInWithEmail(email, password),
  requestPasswordReset: (email: string) => mockRequestPasswordReset(email),
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
}));

type DialogButton = { text: string; onPress?: () => void | Promise<void> };
const mockShowDialog = jest.fn<(title: string, message?: string, buttons?: DialogButton[]) => void>();
jest.mock("../../components/AppDialog", () => ({
  showDialog: (title: string, message?: string, buttons?: DialogButton[]) => mockShowDialog(title, message, buttons),
}));
const mockShowToast = jest.fn();
jest.mock("../../components/AppToast", () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));
const mockOpenBrowser = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

/** Presses the button with this label on the most recent pop-up. */
const pressDialogButton = async (label: string) => {
  const buttons = mockShowDialog.mock.calls.at(-1)?.[2] ?? [];
  await buttons.find((b) => b.text === label)?.onPress?.();
};

describe("SignIn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = "dark";
  });

  it("is drawn dark on a device set to dark and light on a device set to light", async () => {
    const dark = await render(<SignIn />);
    const darkInput = StyleSheet.flatten(dark.getByTestId("sign-in-email-input").props.style);
    await dark.unmount();

    mockTheme = "light";
    const light = await render(<SignIn />);
    const lightInput = StyleSheet.flatten(light.getByTestId("sign-in-email-input").props.style);

    expect(darkInput.backgroundColor).toBe("#1C1C24");
    expect(darkInput.color).toBe("#FFFFFF");
    expect(lightInput.backgroundColor).toBe("#FFFFFF");
    expect(lightInput.color).toBe("#000000");
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

  it("shows a red inline error for a too-short password on a new account and never calls Supabase", async () => {
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    // Nine characters: one short of the minimum.
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "abcdefgh9");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    expect(getByText(/at least 10 characters/i)).toBeTruthy();
    expect(mockNotificationAsync).toHaveBeenCalledWith("error");
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();
  });

  it("accepts a new account whose password is exactly the minimum length", async () => {
    const { getByTestId } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "abcdefgh90");
    await fireEvent.press(getByTestId("sign-in-terms-checkbox"));
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => expect(mockSignUpWithEmail).toHaveBeenCalledWith("player@example.com", "abcdefgh90"));
  });

  // An account made when the minimum was 6 must not be locked out by the app.
  it("does not hold signing in to the new minimum", async () => {
    const { getByTestId, queryByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "abc123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => expect(mockSignInWithEmail).toHaveBeenCalledWith("player@example.com", "abc123"));
    expect(queryByText(/at least 10 characters/i)).toBeNull();
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
    await fireEvent.press(getByTestId("sign-in-terms-checkbox"));
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(mockSignUpWithEmail).toHaveBeenCalledWith("player@example.com", "password123");
    });
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  // A first-time player lands on Sign In; "Invalid login credentials" reads like a typo to someone
  // who simply has no account yet, so the screen points them at Create an account instead.
  it("points a player with no account at Create an account when sign-in is rejected", async () => {
    mockSignInWithEmail.mockRejectedValueOnce(new Error("Invalid login credentials"));
    const { getByTestId, getByText, queryByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(getByText(/don't match an account.*Create an account/)).toBeTruthy();
    });
    expect(queryByText("Invalid login credentials")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows any other sign-in failure as it was reported, and does not navigate", async () => {
    mockSignInWithEmail.mockRejectedValueOnce(new Error("Network request failed"));
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(getByText("Network request failed")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not reword a sign-up failure", async () => {
    mockSignUpWithEmail.mockRejectedValueOnce(new Error("Invalid login credentials"));
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-terms-checkbox"));
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => {
      expect(getByText("Invalid login credentials")).toBeTruthy();
    });
  });

  it("says what the app is for, and never greets a sign-in as a return visit", async () => {
    const { getByText, getByTestId, queryByText } = await render(<SignIn />);

    expect(getByText("Sign In to PlayLink")).toBeTruthy();
    expect(queryByText(/Welcome Back/)).toBeNull();
    expect(getByText(/Find game nights at stores near you/)).toBeTruthy();
    expect(getByText("New here? Create an account")).toBeTruthy();

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    expect(getByText("Welcome to PlayLink!")).toBeTruthy();
    expect(getByText("Already have an account? Sign in")).toBeTruthy();
  });

  it("refuses a new account until the player confirms they are 18 or older and accept the terms", async () => {
    const { getByTestId, getByText, queryByText } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    expect(getByText(/confirm you are 18 or older/i)).toBeTruthy();
    expect(mockNotificationAsync).toHaveBeenCalledWith("error");
    expect(mockSignUpWithEmail).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId("sign-in-terms-checkbox"));
    expect(queryByText(/confirm you are 18 or older/i)).toBeNull();
    expect(getByTestId("sign-in-terms-checkbox").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("never asks a returning player to tick the box", async () => {
    const { getByTestId, queryByTestId } = await render(<SignIn />);

    expect(queryByTestId("sign-in-terms-checkbox")).toBeNull();
    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.changeText(getByTestId("sign-in-password-input"), "password123");
    await fireEvent.press(getByTestId("sign-in-submit-button"));

    await waitFor(() => expect(mockSignInWithEmail).toHaveBeenCalled());
  });

  it("asks for the email first when Forgot password is tapped with none typed", async () => {
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.press(getByTestId("sign-in-forgot-password"));

    expect(getByText(/type your email above/i)).toBeTruthy();
    expect(mockShowDialog).not.toHaveBeenCalled();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("sends a reset link after the player confirms, and says the same thing whether or not the account exists", async () => {
    const { getByTestId } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "  player@example.com ");
    await fireEvent.press(getByTestId("sign-in-forgot-password"));
    expect(mockShowDialog).toHaveBeenCalledWith("Reset your password?", expect.stringContaining("player@example.com"), expect.any(Array));
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();

    await pressDialogButton("Send Link");

    await waitFor(() => expect(mockRequestPasswordReset).toHaveBeenCalledWith("player@example.com"));
    expect(mockShowToast).toHaveBeenCalledWith("Check your email", expect.stringMatching(/if that email has an account/i));
  });

  it("sends nothing when the player cancels the reset", async () => {
    const { getByTestId } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.press(getByTestId("sign-in-forgot-password"));
    await pressDialogButton("Cancel");

    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("shows a failed reset request above the form", async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(new Error("Email rate limit exceeded"));
    const { getByTestId, getByText } = await render(<SignIn />);

    await fireEvent.changeText(getByTestId("sign-in-email-input"), "player@example.com");
    await fireEvent.press(getByTestId("sign-in-forgot-password"));
    await pressDialogButton("Send Link");

    await waitFor(() => expect(getByText("Email rate limit exceeded")).toBeTruthy());
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("offers Forgot password only on the sign-in form", async () => {
    const { getByTestId, queryByTestId } = await render(<SignIn />);

    expect(getByTestId("sign-in-forgot-password")).toBeTruthy();
    await fireEvent.press(getByTestId("sign-in-mode-toggle"));
    expect(queryByTestId("sign-in-forgot-password")).toBeNull();
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
