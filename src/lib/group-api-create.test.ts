import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createGroup, CreateGroupDraft } from "./group-api";

type Result = { data: unknown; error: unknown };

// What the fake database answers, in order, to each insert into `groups`.
let mockGroupInsertResults: Result[] = [];
let mockSeatError: unknown = null;
let mockFetchedRow: Record<string, unknown> | null = null;
const mockGroupInserts: Record<string, unknown>[] = [];
const mockSeatInserts: Record<string, unknown>[] = [];

jest.mock("./supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "group_players") {
        return {
          insert: (row: Record<string, unknown>) => {
            mockSeatInserts.push(row);
            return Promise.resolve({ error: mockSeatError });
          },
        };
      }
      return {
        insert: (row: Record<string, unknown>) => {
          mockGroupInserts.push(row);
          const result = mockGroupInsertResults.shift() ?? { data: null, error: { message: "no result queued" } };
          return { select: () => ({ single: () => Promise.resolve(result) }) };
        },
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockFetchedRow, error: null }) }),
        }),
      };
    },
  },
}));

const draft = (overrides: Partial<CreateGroupDraft> = {}): CreateGroupDraft => ({
  name: "Friday Pod",
  joinCode: "ABC234",
  scheduledAt: Date.parse("2026-10-10T02:00:00Z"),
  playDate: "2026-10-09",
  targetPlayers: 4,
  brackets: [2],
  location: "Card Shop",
  time: "Fri, Oct 9 · 7:00 PM",
  gameType: "mtg",
  format: "Commander",
  noGo: [],
  hostBracket: 2,
  ...overrides,
});

const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "group-1",
  name: "Friday Pod",
  join_code: "ABC234",
  created_by: "host-1",
  created_at: "2026-10-08T12:00:00Z",
  scheduled_at: "2026-10-10T02:00:00Z",
  play_date: "2026-10-09",
  rounds_played: 0,
  target_players: 4,
  brackets: [2],
  location: "Card Shop",
  time: "Fri, Oct 9 · 7:00 PM",
  game_type: "mtg",
  format: "Commander",
  no_go: [],
  confirmed: false,
  group_players: [
    { player_id: "host-1", role: "Host", bracket: 2, profiles: { username: "host", display_name: null, location: "Reno" } },
  ],
  ...overrides,
});

describe("createGroup and the day a group is played", () => {
  beforeEach(() => {
    mockGroupInserts.length = 0;
    mockSeatInserts.length = 0;
    mockGroupInsertResults = [{ data: { id: "group-1" }, error: null }];
    mockSeatError = null;
    mockFetchedRow = storedRow();
  });

  it("sends the day the host picked, not just the scheduled instant", async () => {
    await createGroup("host-1", draft());

    expect(mockGroupInserts).toHaveLength(1);
    expect(mockGroupInserts[0].play_date).toBe("2026-10-09");
    // 7 PM Pacific on the 9th is already the 10th in UTC - the reason play_date exists.
    expect(mockGroupInserts[0].scheduled_at).toBe("2026-10-10T02:00:00.000Z");
  });

  it("leaves play_date out entirely when the draft has none", async () => {
    await createGroup("host-1", draft({ playDate: undefined }));

    expect("play_date" in mockGroupInserts[0]).toBe(false);
  });

  it("seats the host after the group row is created", async () => {
    await createGroup("host-1", draft());

    expect(mockSeatInserts).toEqual([{ group_id: "group-1", player_id: "host-1", role: "Host", bracket: 2 }]);
  });

  it("reads the day back onto the group it returns", async () => {
    const group = await createGroup("host-1", draft());

    expect(group.playDate).toBe("2026-10-09");
  });

  it("returns a group with no playDate when the stored row has none", async () => {
    mockFetchedRow = storedRow({ play_date: null });

    expect((await createGroup("host-1", draft())).playDate).toBeUndefined();
  });

  it("retries without play_date when the server doesn't have the column yet", async () => {
    mockGroupInsertResults = [
      { data: null, error: { code: "PGRST204", message: "Could not find the 'play_date' column" } },
      { data: { id: "group-1" }, error: null },
    ];

    const group = await createGroup("host-1", draft());

    expect(mockGroupInserts).toHaveLength(2);
    expect(mockGroupInserts[0].play_date).toBe("2026-10-09");
    expect("play_date" in mockGroupInserts[1]).toBe(false);
    expect(mockGroupInserts[1].name).toBe("Friday Pod");
    expect(group.id).toBe("group-1");
  });

  it("does not retry for any other refusal", async () => {
    const error = { code: "23505", message: 'duplicate key value violates unique constraint "groups_join_code_idx"' };
    mockGroupInsertResults = [{ data: null, error }];

    await expect(createGroup("host-1", draft())).rejects.toBe(error);
    expect(mockGroupInserts).toHaveLength(1);
    expect(mockSeatInserts).toHaveLength(0);
  });

  it("does not retry a missing-column error when there was no play_date to drop", async () => {
    const error = { code: "PGRST204", message: "Could not find the 'local_event_id' column" };
    mockGroupInsertResults = [{ data: null, error }];

    await expect(createGroup("host-1", draft({ playDate: undefined }))).rejects.toBe(error);
    expect(mockGroupInserts).toHaveLength(1);
  });

  it("throws the database's refusal when the host already has a group that day", async () => {
    mockSeatError = { code: "23505", message: 'duplicate key value violates unique constraint "group_players_one_per_day"' };

    await expect(createGroup("host-1", draft())).rejects.toBe(mockSeatError);
  });
});
