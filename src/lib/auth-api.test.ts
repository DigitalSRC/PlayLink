import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MIN_PASSWORD_LENGTH, updatePassword, WRONG_CURRENT_PASSWORD } from "./auth-api";

type AuthResult = { data?: unknown; error: unknown };

let mockGetUserResult: AuthResult = { data: { user: { email: "me@example.com" } }, error: null };
let mockSignInResult: AuthResult = { error: null };
let mockUpdateResult: AuthResult = { error: null };
const mockGetUser = jest.fn();
const mockSignIn = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
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
    },
  },
}));

describe("updatePassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserResult = { data: { user: { email: "me@example.com" } }, error: null };
    mockSignInResult = { error: null };
    mockUpdateResult = { error: null };
  });

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
