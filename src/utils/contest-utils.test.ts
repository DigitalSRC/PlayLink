import { describe, expect, it } from "@jest/globals";
import {
  Ballot,
  CONTEST_WINDOW_MS,
  contestMinutesLeft,
  leadingOrder,
  normalizePlacements,
  orderKey,
  tallyBallots,
  voteStatus,
} from "./contest-utils";

const order = (...ids: string[]) => ids.map((playerId, i) => ({ playerId, placement: i + 1 }));
const ballot = (playerId: string, ...ids: string[]): Ballot => ({ playerId, placements: order(...ids) });
const reported = order("host", "b", "c", "d");

describe("CONTEST_WINDOW_MS", () => {
  it("is 15 minutes, matching the server", () => {
    expect(CONTEST_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe("normalizePlacements", () => {
  it("sorts by position and drops everything but the player and position", () => {
    const messy = [
      { playerId: "b", placement: 2, pointsAwarded: 25, outcome: "draw" },
      { playerId: "a", placement: 1, pointsAwarded: 40 },
    ];
    expect(normalizePlacements(messy)).toEqual([{ playerId: "a", placement: 1 }, { playerId: "b", placement: 2 }]);
  });

  it("turns any numbering of the same finish into competition ranks", () => {
    const spread = [
      { playerId: "d", placement: 9 }, { playerId: "c", placement: 5 },
      { playerId: "a", placement: 2 }, { playerId: "b", placement: 3 },
    ];
    expect(normalizePlacements(spread)).toEqual(order("a", "b", "c", "d"));
  });

  it("keeps ties: 1, 2, 2 and then 4", () => {
    const tied = [
      { playerId: "a", placement: 1 }, { playerId: "c", placement: 2 },
      { playerId: "b", placement: 2 }, { playerId: "d", placement: 3 },
    ];
    expect(normalizePlacements(tied)).toEqual([
      { playerId: "a", placement: 1 }, { playerId: "b", placement: 2 },
      { playerId: "c", placement: 2 }, { playerId: "d", placement: 4 },
    ]);
  });

  it("lower-cases ids and handles an empty order", () => {
    expect(normalizePlacements([{ playerId: "ABC", placement: 1 }])).toEqual([{ playerId: "abc", placement: 1 }]);
    expect(normalizePlacements([])).toEqual([]);
  });
});

describe("orderKey", () => {
  it("is the same for two reports of the same finish", () => {
    expect(orderKey(order("a", "b", "c"))).toBe(orderKey([
      { playerId: "c", placement: 30 }, { playerId: "a", placement: 10 }, { playerId: "b", placement: 20 },
    ]));
  });

  it("differs when the finish differs, including by a tie", () => {
    expect(orderKey(order("a", "b"))).not.toBe(orderKey(order("b", "a")));
    expect(orderKey(order("a", "b"))).not.toBe(orderKey([{ playerId: "a", placement: 1 }, { playerId: "b", placement: 1 }]));
  });

  it("is empty for an empty order", () => {
    expect(orderKey([])).toBe("");
  });
});

describe("tallyBallots", () => {
  it("with no votes, lists just the report with no voters", () => {
    expect(tallyBallots(reported, [])).toEqual([{ placements: reported, voterIds: [], isReport: true }]);
  });

  it("groups votes by order, most votes first", () => {
    const options = tallyBallots(reported, [
      ballot("host", "host", "b", "c", "d"),
      ballot("b", "b", "host", "c", "d"),
      ballot("c", "b", "host", "c", "d"),
    ]);
    expect(options.map((o) => [o.isReport, o.voterIds])).toEqual([[false, ["b", "c"]], [true, ["host"]]]);
  });

  it("puts the report first among equals", () => {
    const options = tallyBallots(reported, [ballot("b", "b", "host", "c", "d"), ballot("host", "host", "b", "c", "d")]);
    expect(options[0].isReport).toBe(true);
  });

  it("counts a vote sent with different numbers as the same order", () => {
    const sameAsReport: Ballot = { playerId: "b", placements: [
      { playerId: "d", placement: 8 }, { playerId: "c", placement: 6 },
      { playerId: "b", placement: 4 }, { playerId: "host", placement: 2 },
    ] };
    const options = tallyBallots(reported, [ballot("host", "host", "b", "c", "d"), sameAsReport]);
    expect(options).toHaveLength(1);
    expect(options[0].voterIds).toEqual(["host", "b"]);
  });
});

describe("leadingOrder", () => {
  const hostVote = ballot("host", "host", "b", "c", "d");

  it("is the report when nobody has voted, or only the host has", () => {
    expect(leadingOrder(reported, []).isReport).toBe(true);
    expect(leadingOrder(reported, [hostVote]).isReport).toBe(true);
  });

  it("one contester against the host is a tie, so the report stands", () => {
    expect(leadingOrder(reported, [hostVote, ballot("b", "b", "host", "c", "d")]).isReport).toBe(true);
  });

  it("two players entering the same different order overrule the host", () => {
    const lead = leadingOrder(reported, [hostVote, ballot("b", "b", "host", "c", "d"), ballot("c", "b", "host", "c", "d")]);
    expect(lead.isReport).toBe(false);
    expect(lead.placements).toEqual(order("b", "host", "c", "d"));
    expect(lead.voterIds).toEqual(["b", "c"]);
  });

  it("players who agree with the host defend the report", () => {
    const lead = leadingOrder(reported, [
      hostVote, ballot("b", "b", "host", "c", "d"), ballot("c", "host", "b", "c", "d"), ballot("d", "host", "b", "c", "d"),
    ]);
    expect(lead.isReport).toBe(true);
    expect(lead.voterIds).toEqual(["host", "c", "d"]);
  });

  it("three different orders with one vote each leave the report standing", () => {
    expect(leadingOrder(reported, [hostVote, ballot("b", "b", "host", "c", "d"), ballot("c", "c", "host", "b", "d")]).isReport).toBe(true);
  });

  it("two challengers tied with each other above the report still leave it standing", () => {
    const six = order("host", "b", "c", "d", "e", "f");
    const lead = leadingOrder(six, [
      ballot("host", "host", "b", "c", "d", "e", "f"),
      ballot("b", "b", "host", "c", "d", "e", "f"), ballot("c", "b", "host", "c", "d", "e", "f"),
      ballot("d", "d", "host", "b", "c", "e", "f"), ballot("e", "d", "host", "b", "c", "e", "f"),
    ]);
    expect(lead.isReport).toBe(true);
  });
});

describe("voteStatus", () => {
  const ballots = [ballot("host", "host", "b", "c", "d"), ballot("b", "b", "host", "c", "d"), ballot("c", "host", "b", "c", "d")];

  it("is none for a player who has not voted", () => {
    expect(voteStatus(reported, ballots, "d")).toBe("none");
    expect(voteStatus(reported, [], "host")).toBe("none");
  });

  it("is agreed for a vote matching the report, the host's own included", () => {
    expect(voteStatus(reported, ballots, "c")).toBe("agreed");
    expect(voteStatus(reported, ballots, "host")).toBe("agreed");
  });

  it("is contested for a different order", () => {
    expect(voteStatus(reported, ballots, "b")).toBe("contested");
  });

  it("matches ids whatever their letter case", () => {
    expect(voteStatus(reported, ballots, "B")).toBe("contested");
  });
});

describe("contestMinutesLeft", () => {
  const end = 1_000_000_000;

  it("rounds up, so the last seconds still read 1 minute", () => {
    expect(contestMinutesLeft(end, end - CONTEST_WINDOW_MS)).toBe(15);
    expect(contestMinutesLeft(end, end - 61_000)).toBe(2);
    expect(contestMinutesLeft(end, end - 1)).toBe(1);
  });

  it("is 0 at the deadline and after it", () => {
    expect(contestMinutesLeft(end, end)).toBe(0);
    expect(contestMinutesLeft(end, end + 60_000)).toBe(0);
  });
});
