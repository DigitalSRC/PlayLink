import { describe, expect, it } from "@jest/globals";
import { playerErrorMessage } from "./error-utils";

const FALLBACK = "Please try again.";

describe("playerErrorMessage", () => {
  it("shows a refusal one of our own SQL functions worded for the player", () => {
    expect(playerErrorMessage({ code: "P0001", message: "This group is full." }, FALLBACK)).toBe("This group is full.");
    expect(playerErrorMessage({ code: "P0001", message: "A round needs at least 2 players." }, FALLBACK))
      .toBe("A round needs at least 2 players.");
  });

  it("hides the database's own errors, which name tables and constraints", () => {
    expect(playerErrorMessage({ code: "42501", message: "permission denied for table groups" }, FALLBACK)).toBe(FALLBACK);
    expect(playerErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "groups_join_code_idx"' }, FALLBACK)).toBe(FALLBACK);
    expect(playerErrorMessage({ code: "23514", message: 'new row for relation "groups" violates check constraint "groups_play_date_near_schedule"' }, FALLBACK)).toBe(FALLBACK);
    expect(playerErrorMessage({ code: "42703", message: 'column "joined_at" does not exist' }, FALLBACK)).toBe(FALLBACK);
  });

  it("hides the API layer's own errors", () => {
    expect(playerErrorMessage({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, FALLBACK)).toBe(FALLBACK);
    expect(playerErrorMessage({ code: "PGRST204", message: "Could not find the 'area' column of 'groups' in the schema cache" }, FALLBACK)).toBe(FALLBACK);
  });

  it("keeps the message of an error that did not come from the database", () => {
    expect(playerErrorMessage(new Error("Network request failed"), FALLBACK)).toBe("Network request failed");
    // The auth service's errors carry a word for a code, not a SQLSTATE, and are written for people.
    expect(playerErrorMessage({ code: "weak_password", message: "Password should be at least 10 characters." }, FALLBACK))
      .toBe("Password should be at least 10 characters.");
    expect(playerErrorMessage({ code: 500, message: "Something specific" }, FALLBACK)).toBe("Something specific");
  });

  it("works on a real Error that carries a database code", () => {
    const denied = Object.assign(new Error("permission denied for table group_players"), { code: "42501" });
    const raised = Object.assign(new Error("Only the host may submit a result"), { code: "P0001" });
    expect(playerErrorMessage(denied, FALLBACK)).toBe(FALLBACK);
    expect(playerErrorMessage(raised, FALLBACK)).toBe("Only the host may submit a result");
  });

  it("trims the message it shows", () => {
    expect(playerErrorMessage({ message: "  Try later.  " }, FALLBACK)).toBe("Try later.");
  });

  it("falls back when there is nothing usable to say, and never throws", () => {
    for (const nothing of [undefined, null, "boom", 42, {}, { message: "" }, { message: "   " }, { message: 7 }, { code: "P0001" }, []]) {
      expect(playerErrorMessage(nothing, FALLBACK)).toBe(FALLBACK);
    }
  });
});
