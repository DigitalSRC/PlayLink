import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  deleteAccount,
  MIN_PASSWORD_LENGTH,
  requestPasswordReset,
  setNewPassword,
  signUpWithEmail,
  startPasswordReset,
  updatePassword,
  WRONG_CURRENT_PASSWORD,
} from "./auth-api";

type AuthResult = { data?: unknown; error: unknown };

let mockGetUserResult: AuthResult = { data: { user: { email: "me@example.com" } }, error: null };
let mockSignInResult: AuthResult = { error: null };
let mockUpdateResult: AuthResult = { error: null };
let mockRpcResult: AuthResult = { data: "deleted", error: null };
let mockResetResult: AuthResult = { error: null };
let mockExchangeResult: AuthResult = { error: null };
let mockSignUpResult: AuthResult = { error: null };
const mockGetUser = jest.fn();
const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();
const mockRpc = jest.fn();
const mockReset = jest.fn();
const mockExchange = jest.fn();
const mockSignUp = jest.fn();

jest.mock("expo-linking", () => ({
  createURL: (path: string) => `playlink://${path}`,
}));

jest.mock("./supabase", () => ({
  supabase: {
    rpc: (name: string) => {
      mockRpc(name);
      return Promise.resolve(mockRpcResult);
    },
    auth: {
      getUser: () => {
        mockGetUser();
        return Promise.resolve(mockGetUserResult);
      },
      signInWithPassword: (args: unknown) => {
        mockSignIn(args);
        return Promise.resolve(mockSignInResult);
      },
      updateUser: (args: unknown) => {
        mockUpdateUser(args);
        return Promise.resolve(mockUpdateResult);
      },
      resetPasswordForEmail: (email: string, options: unknown) => {
        mockReset(email, options);
        return Promise.resolve(mockResetResult);
      },
      exchangeCodeForSession: (code: string) => {
        mockExchange(code);
        return Promise.resolve(mockExchangeResult);
      },
      signUp: (args: unknown) => {
        mockSignUp(args);
        return Promise.resolve(mockSignUpResult);
      },
    },
  },
}));

const resetMocks = () => {
  jest.clearAllMocks();
  mockGetUserResult = { data: { user: { email: "me@example.com" } }, error: null };
  mockSignInResult = { error: null };
  mockUpdateResult = { error: null };
  mockRpcResult = { data: "deleted", error: null };
  mockResetResult = { error: null };
  mockExchangeResult = { error: null };
  mockSignUpResult = { error: null };
};

describe("deleteAccount", () => {
  beforeEach(resetMocks);

  it("checks the password against the account's own email, then asks the server to delete", async () => {
    await deleteAccount("my-password-1");
    expect(mockSignIn).toHaveBeenCalledWith({ email: "me@example.com", password: "my-password-1" });
    expect(mockRpc).toHaveBeenCalledWith("delete_my_account");
    expect(mockSignIn.mock.invocationCallOrder[0]).toBeLessThan(mockRpc.mock.invocationCallOrder[0]);
  });

  it("deletes nothing when the password is wrong", async () => {
    mockSignInResult = { error: { message: "Invalid login credentials" } };
    await expect(deleteAccount("wrong")).rejects.toThrow(WRONG_CURRENT_PASSWORD);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("deletes nothing without a session", async () => {
    mockGetUserResult = { data: { user: null }, error: { message: "Auth session missing!" } };
    await expect(deleteAccount("my-password-1")).rejects.toThrow("Please sign in again.");
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes on the server's refusal, such as a round that can still be contested", async () => {
    const refusal = { code: "P0001", message: "A round in this group can still be contested. Try again in a few minutes, once it is final." };
    mockRpcResult = { data: null, error: refusal };
    await expect(deleteAccount("my-password-1")).rejects.toBe(refusal);
  });
});

describe("password reset", () => {
  beforeEach(resetMocks);

  it("emails a link back to the app's reset screen", async () => {
    await requestPasswordReset("me@example.com");
    expect(mockReset).toHaveBeenCalledWith("me@example.com", { redirectTo: "playlink://reset-password" });
  });

  it("passes on a refused reset request", async () => {
    const limited = { message: "Email rate limit exceeded" };
    mockResetResult = { error: limited };
    await expect(requestPasswordReset("me@example.com")).rejects.toBe(limited);
  });

  it("signs in with the link's code", async () => {
    await startPasswordReset("abc123");
    expect(mockExchange).toHaveBeenCalledWith("abc123");
  });

  it("throws when the link's code is expired or from another device", async () => {
    const expired = { message: "invalid flow state, no valid flow state found" };
    mockExchangeResult = { error: expired };
    await expect(startPasswordReset("abc123")).rejects.toBe(expired);
  });

  it("sets the new password without asking for the old one", async () => {
    await setNewPassword("brand-new-password");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "brand-new-password" });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("passes on a refused new password", async () => {
    const weak = { message: "Password is known to be weak and easy to guess" };
    mockUpdateResult = { error: weak };
    await expect(setNewPassword("password1234")).rejects.toBe(weak);
  });
});

describe("signUpWithEmail", () => {
  beforeEach(resetMocks);

  it("records when the player confirmed their age and accepted the terms", async () => {
    await signUpWithEmail("new@example.com", "long-enough-pw");
    const args = mockSignUp.mock.calls[0][0] as { email: string; password: string; options: { data: Record<string, string> } };
    expect(args.email).toBe("new@example.com");
    expect(args.password).toBe("long-enough-pw");
    expect(Number.isNaN(Date.parse(args.options.data.adult_and_terms_accepted_at))).toBe(false);
  });
});

describe("updatePassword", () => {
  beforeEach(resetMocks);

  it("checks the current password against the account's own email, then changes it", async () => {
    await updatePassword("old-password-1", "new-password-22");
    expect(mockSignIn).toHaveBeenCalledWith({ email: "me@example.com", password: "old-password-1" });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "new-password-22" });
    expect(mockSignIn.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateUser.mock.invocationCallOrder[0]);
  });

  it("changes nothing when the current password is wrong", async () => {
    mockSignInResult = { error: { message: "Invalid login credentials" } };
    await expect(updatePassword("wrong", "new-password-22")).rejects.toThrow(WRONG_CURRENT_PASSWORD);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not call a failed check a wrong password when it failed for another reason", async () => {
    const rateLimited = { message: "Request rate limit reached" };
    mockSignInResult = { error: rateLimited };
    await expect(updatePassword("old-password-1", "new-password-22")).rejects.toBe(rateLimited);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in when there is no session", async () => {
    mockGetUserResult = { data: { user: null }, error: { message: "Auth session missing!" } };
    await expect(updatePassword("old-password-1", "new-password-22")).rejects.toThrow("Please sign in again.");
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("asks for a fresh sign-in when the account has no email to check against", async () => {
    mockGetUserResult = { data: { user: { email: undefined } }, error: null };
    await expect(updatePassword("old-password-1", "new-password-22")).rejects.toThrow("Please sign in again.");
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not crash when the user lookup returns nothing at all", async () => {
    mockGetUserResult = { data: undefined, error: null };
    await expect(updatePassword("old-password-1", "new-password-22")).rejects.toThrow("Please sign in again.");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("passes on the server's refusal of the new password", async () => {
    const tooShort = { message: `Password should be at least ${MIN_PASSWORD_LENGTH} characters.` };
    mockUpdateResult = { error: tooShort };
    await expect(updatePassword("old-password-1", "short")).rejects.toBe(tooShort);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
