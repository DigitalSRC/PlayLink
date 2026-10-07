import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import CalendarScreen from "../../app/(tabs)/calendar";
import { LocalEvent } from "../../data/local-events";

// Tuesday, October 6, 2026 at noon local time.
const mockNow = new Date(2026, 9, 6, 12, 0).getTime();

let mockCurrentUser: { id?: string; location: string } | null = { id: "user-1", location: "Reno, NV" };
let mockGroups: { players: { id: string }[] }[] = [];
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({
    currentUser: mockCurrentUser,
    session: { user: { id: "user-1" } },
    getNow: () => mockNow,
    groups: mockGroups,
    theme: "dark",
  }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUpdateProfile = jest.fn();
jest.mock("../../hooks/useProfileQueries", () => ({
  useUpdateProfileMutation: () => ({ mutate: mockUpdateProfile }),
}));

interface MockAreaState {
  data?: { area: { id: string; label: string }; synced: boolean; lastSyncedAt: string | null; syncError: string | null };
  error?: { code: string } | null;
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
}
interface MockRefreshState {
  data?: MockAreaState["data"];
  isPending: boolean;
  isError: boolean;
}
const mockAreaRefetch = jest.fn();
const mockRefreshMutate = jest.fn();
const mockRefreshReset = jest.fn();
const mockUseEventAreaQuery = jest.fn<(location: string) => MockAreaState>();
const mockUseRefresh = jest.fn<() => MockRefreshState>();

interface MockQueryState {
  data?: LocalEvent[];
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
}
const mockRefetch = jest.fn();
const mockUseLocalEventsQuery = jest.fn<(area: string, format?: string) => MockQueryState>();
jest.mock("../../hooks/useLocalEventQueries", () => ({
  useLocalEventsQuery: (area: string, format?: string) => ({
    ...mockUseLocalEventsQuery(area, format),
    refetch: mockRefetch,
  }),
  useEventAreaQuery: (location: string) => ({
    ...mockUseEventAreaQuery(location),
    refetch: mockAreaRefetch,
  }),
  useRefreshEventAreaMutation: () => ({
    ...mockUseRefresh(),
    mutate: mockRefreshMutate,
    reset: mockRefreshReset,
  }),
}));

// Events were last refreshed 30 minutes before "now".
const resolvedArea = (overrides: Partial<NonNullable<MockAreaState["data"]>> = {}): MockAreaState => ({
  data: {
    area: { id: "reno-sparks", label: "Reno-Sparks, NV" },
    synced: false,
    lastSyncedAt: new Date(mockNow - 30 * 60 * 1000).toISOString(),
    syncError: null,
    ...overrides,
  },
  error: null,
  isPending: false,
  isError: false,
  isRefetching: false,
});
const idleRefresh: MockRefreshState = { data: undefined, isPending: false, isError: false };

const makeEvent = (overrides: Partial<LocalEvent>): LocalEvent => ({
  id: "event-1",
  area: "reno-sparks",
  venueName: "Test Venue",
  address: "",
  gameType: "mtg",
  format: "Commander",
  startTime: "18:00:00",
  title: "",
  notes: "",
  ...overrides,
});

// Every Tuesday (Oct 6, 13, 20, 27) - shortens to "Tuesday" on the grid.
const tuesdayNight = makeEvent({
  id: "tue",
  venueName: "Tuesday Game Store",
  address: "123 Example St, Reno, NV",
  dayOfWeek: 2,
  startTime: "18:00:00",
  endTime: "22:00:00",
  title: "Casual Commander",
  notes: "Casual pods",
});
// Every Wednesday (Oct 7, 14, 21, 28) - shortens to "Wednesday".
const wednesdayNight = makeEvent({
  id: "wed",
  venueName: "Wednesday Card Shop",
  dayOfWeek: 3,
  startTime: "17:30:00",
});
const fridayDraft = makeEvent({
  id: "draft",
  venueName: "Draft House",
  format: "Booster Draft",
  eventDate: "2026-10-09",
  title: "Friday Draft",
});
const earlierThisMonth = makeEvent({ id: "past", venueName: "Past Place", eventDate: "2026-10-02" });
const nextMonth = makeEvent({ id: "nov", venueName: "November Shop", eventDate: "2026-11-03" });

const allEvents = [tuesdayNight, wednesdayNight, fridayDraft, earlierThisMonth, nextMonth];

const loaded = (data: LocalEvent[]): MockQueryState => ({
  data,
  isLoading: false,
  isError: false,
  isRefetching: false,
});

describe("CalendarScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { id: "user-1", location: "Reno, NV" };
    mockGroups = [];
    mockUseLocalEventsQuery.mockReturnValue(loaded(allEvents));
    mockUseEventAreaQuery.mockReturnValue(resolvedArea());
    mockUseRefresh.mockReturnValue(idleRefresh);
  });

  it("requests every format for the player's area, so switching needs no refetch", async () => {
    await render(<CalendarScreen />);

    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("reno-sparks", undefined);
  });

  it("resolves the area from the profile location and shows its name", async () => {
    mockCurrentUser = { location: "  Sacramento, CA " };
    mockUseEventAreaQuery.mockReturnValue(
      resolvedArea({ area: { id: "sacramento-california-us", label: "Sacramento, CA" } })
    );
    const { getByText } = await render(<CalendarScreen />);

    expect(mockUseEventAreaQuery).toHaveBeenCalledWith("Sacramento, CA");
    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("sacramento-california-us", undefined);
    expect(getByText("Sacramento, CA")).toBeTruthy();
  });

  it("opens on the current month showing Commander, with no month navigation", async () => {
    const { getByText, queryByLabelText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(getByText("October 2026")).toBeTruthy();
    expect(queryByLabelText("Next month")).toBeNull();
    expect(queryByLabelText("Previous month")).toBeNull();
    expect(queryByText("Back to today")).toBeNull();
  });

  it("writes the store names on the days that have an event and marks today", async () => {
    const { getByLabelText, getAllByText } = await render(<CalendarScreen />);

    expect(getByLabelText("2026-10-06, today, Tuesday")).toBeTruthy();
    expect(getByLabelText("2026-10-07, Wednesday")).toBeTruthy();
    expect(getByLabelText("2026-10-02, Past")).toBeTruthy();
    expect(getByLabelText("2026-10-08")).toBeTruthy();
    // One label per Tuesday in October 2026.
    expect(getAllByText("Tuesday")).toHaveLength(4);
  });

  it("collapses a crowded day to two names and a +N", async () => {
    const crowded = ["Alpha", "Bravo", "Charlie", "Delta"].map((name, i) =>
      makeEvent({ id: name, venueName: name, eventDate: "2026-10-15", startTime: `1${i}:00:00` })
    );
    mockUseLocalEventsQuery.mockReturnValue(loaded(crowded));
    const { getByText, queryByText, getByLabelText } = await render(<CalendarScreen />);

    expect(getByLabelText("2026-10-15, Alpha, Bravo, Charlie, Delta")).toBeTruthy();
    expect(getByText("+2")).toBeTruthy();
    // Alpha appears on the grid and in the list; Charlie only in the list.
    expect(queryByText("Charlie")).toBeTruthy();
  });

  it("lists upcoming events from today onward with their details", async () => {
    const { getByText, getAllByText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("Coming up this month")).toBeTruthy();
    expect(getByText("Today · Tuesday, October 6")).toBeTruthy();
    expect(getByText("Wednesday, October 7")).toBeTruthy();
    expect(getByText("Tuesday, October 27")).toBeTruthy();
    expect(getAllByText("Tuesday Game Store")).toHaveLength(4);
    expect(getAllByText("Casual Commander")).toHaveLength(4);
    expect(getAllByText("6:00 PM – 10:00 PM")).toHaveLength(4);
    expect(getAllByText("123 Example St, Reno, NV")).toHaveLength(4);
    expect(getAllByText("Casual pods")).toHaveLength(4);
    // No end time on this one, so only the start is shown.
    expect(getAllByText("5:30 PM")).toHaveLength(4);
    // Earlier this month, next month, and other formats are all left out of the list.
    expect(queryByText("Past Place")).toBeNull();
    expect(queryByText("November Shop")).toBeNull();
    expect(queryByText("Draft House")).toBeNull();
  });

  it("puts the upcoming days in date order", async () => {
    const { getAllByText } = await render(<CalendarScreen />);

    const headings = getAllByText(/^(Today · )?(Tuesday|Wednesday), October \d+$/).map((node) =>
      String([node.props.children].flat().join(""))
    );
    expect(headings).toEqual([
      "Today · Tuesday, October 6",
      "Wednesday, October 7",
      "Tuesday, October 13",
      "Wednesday, October 14",
      "Tuesday, October 20",
      "Wednesday, October 21",
      "Tuesday, October 27",
      "Wednesday, October 28",
    ]);
  });

  // The app is Commander-only for now (COMMANDER_ONLY in data/types.ts): other formats exist in
  // the data but there is no way to see or switch to them.
  it("offers no way to switch format, even when other formats have events", async () => {
    const { getByText, getAllByText, queryByLabelText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(queryByLabelText("Show Booster Draft events")).toBeNull();
    expect(queryByLabelText("Show Commander events")).toBeNull();
    expect(queryByText("Booster Draft")).toBeNull();
    expect(queryByText("Draft House")).toBeNull();
    expect(getAllByText("Tuesday Game Store").length).toBeGreaterThan(0);
  });

  it("hides the switcher when there is only one format", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([tuesdayNight, wednesdayNight]));
    const { getByText, queryByLabelText } = await render(<CalendarScreen />);

    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(queryByLabelText("Show Commander events")).toBeNull();
  });

  it("stays on Commander, and says there is nothing on, when only other formats have events", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([fridayDraft]));
    const { getByText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(getByText("No more Commander events this month.")).toBeTruthy();
    expect(queryByText("Draft House")).toBeNull();
  });

  it("narrows the list to a tapped day, and Show all upcoming restores it", async () => {
    const { getByText, getAllByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-07, Wednesday"));

    expect(getByText("Selected day")).toBeTruthy();
    expect(getByText("Wednesday, October 7")).toBeTruthy();
    expect(getAllByText("Wednesday Card Shop")).toHaveLength(1);
    expect(queryByText("Tuesday Game Store")).toBeNull();

    await fireEvent.press(getByText("Show all upcoming"));

    expect(getByText("Coming up this month")).toBeTruthy();
    expect(getAllByText("Tuesday Game Store")).toHaveLength(4);
  });

  it("tapping the selected day again clears the selection", async () => {
    const { getByText, getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-07, Wednesday"));
    expect(getByText("Selected day")).toBeTruthy();

    await fireEvent.press(getByLabelText("2026-10-07, Wednesday"));
    expect(getByText("Coming up this month")).toBeTruthy();
  });

  it("can show a past day's event when that day is tapped", async () => {
    const { getByText, getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-02, Past"));

    expect(getByText("Friday, October 2")).toBeTruthy();
    expect(getByText("Past Place")).toBeTruthy();
  });

  it("opens the create-group form tied to the store and night when Create game is tapped", async () => {
    const { getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("Create a game at Wednesday Card Shop on Wednesday, October 7"));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/browse",
      params: {
        openCreate: "1",
        storeEventId: "wed",
        storeEventVenue: "Wednesday Card Shop",
        storeEventDate: "2026-10-07",
        storeEventStart: wednesdayNight.startTime,
        storeEventGame: "mtg",
        storeEventFormat: "Commander",
      },
    });
  });

  it("offers Create game on today's event but not on a day that has passed", async () => {
    const { getByLabelText, queryByLabelText, getByText } = await render(<CalendarScreen />);

    expect(getByLabelText("Create a game at Tuesday Game Store on Tuesday, October 6")).toBeTruthy();

    await fireEvent.press(getByLabelText("2026-10-02, Past"));
    expect(getByText("Past Place")).toBeTruthy();
    expect(queryByLabelText(/^Create a game at Past Place/)).toBeNull();
  });

  it("explains instead of opening the form when the player is already in a group", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGroups = [{ players: [{ id: "someone-else" }, { id: "user-1" }] }];
    const { getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("Create a game at Wednesday Card Shop on Wednesday, October 7"));

    expect(mockPush).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("Already in a group", expect.any(String));
    alertSpy.mockRestore();
  });

  it("still opens the form when the player is only in nobody's group but others exist", async () => {
    mockGroups = [{ players: [{ id: "someone-else" }] }];
    const { getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("Create a game at Wednesday Card Shop on Wednesday, October 7"));

    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("says so when the tapped day has no event", async () => {
    const { getByText, getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-08"));

    expect(getByText("No Commander event on Thursday, October 8.")).toBeTruthy();
  });

  it("says so when nothing is left this month", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([earlierThisMonth, nextMonth]));
    const { getByText } = await render(<CalendarScreen />);

    expect(getByText("No more Commander events this month.")).toBeTruthy();
  });

  it("shows an empty state when the area has no events at all", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([]));
    const { getByText } = await render(<CalendarScreen />);

    expect(getByText("No events found here yet")).toBeTruthy();
    expect(getByText(/No store near Reno-Sparks, NV has posted events/)).toBeTruthy();
  });

  it("shows a retry card when the events can't be loaded, and retries on press", async () => {
    mockUseLocalEventsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isRefetching: false,
    });
    const { getByText } = await render(<CalendarScreen />);

    expect(getByText("Couldn't load events")).toBeTruthy();
    await fireEvent.press(getByText("Try again"));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("still renders the month grid while the events are loading", async () => {
    mockUseLocalEventsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isRefetching: false,
    });
    const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("October 2026")).toBeTruthy();
    expect(getByLabelText("2026-10-06, today")).toBeTruthy();
    expect(queryByText("No events found here yet")).toBeNull();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<CalendarScreen />);

    expect(toJSON()).toBeNull();
  });

  describe("location", () => {
    it("asks for a location when the profile has none, without looking anything up", async () => {
      mockCurrentUser = { location: "   " };
      mockUseEventAreaQuery.mockReturnValue({ isPending: true, isError: false, isRefetching: false });
      const { getByText, queryByText } = await render(<CalendarScreen />);

      expect(getByText("No location set")).toBeTruthy();
      expect(getByText("Set your location")).toBeTruthy();
      expect(queryByText(/Finding events near/)).toBeNull();
      expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("", undefined);
    });

    // Onboarding used to save a blank city as "Nearby"; it isn't a place, so those profiles are
    // asked for a location instead of being told "Nearby" couldn't be found.
    it("treats an old profile's placeholder 'Nearby' as no location", async () => {
      mockCurrentUser = { location: " Nearby " };
      mockUseEventAreaQuery.mockReturnValue({ isPending: true, isError: false, isRefetching: false });
      const { getByText, queryByText } = await render(<CalendarScreen />);

      expect(getByText("Set your location")).toBeTruthy();
      expect(queryByText(/Nearby/)).toBeNull();
      expect(mockUseEventAreaQuery).toHaveBeenCalledWith("");
      expect(mockUseEventAreaQuery).not.toHaveBeenCalledWith("Nearby");
    });

    it("shows a finding message while the area is being worked out", async () => {
      mockUseEventAreaQuery.mockReturnValue({ isPending: true, isError: false, isRefetching: false });
      const { getByText, queryByText } = await render(<CalendarScreen />);

      expect(getByText("Finding events near Reno, NV…")).toBeTruthy();
      expect(getByText("Reno, NV")).toBeTruthy();
      expect(queryByText("October 2026")).toBeNull();
    });

    it("says it couldn't find an unrecognised place and offers to change it", async () => {
      mockCurrentUser = { location: "Xqzvwpl" };
      mockUseEventAreaQuery.mockReturnValue({
        error: { code: "location_not_found" },
        isPending: false,
        isError: true,
        isRefetching: false,
      });
      const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

      expect(getByText("We couldn't find “Xqzvwpl”")).toBeTruthy();
      expect(queryByText("Try again")).toBeNull();

      await fireEvent.press(getByText("Change location"));
      expect(getByLabelText("Location").props.value).toBe("Xqzvwpl");
    });

    it("offers a retry, not a retype, when the lookup itself failed", async () => {
      mockUseEventAreaQuery.mockReturnValue({
        error: { code: "unavailable" },
        isPending: false,
        isError: true,
        isRefetching: false,
      });
      const { getByText } = await render(<CalendarScreen />);

      expect(getByText("Couldn't load your area")).toBeTruthy();
      await fireEvent.press(getByText("Try again"));
      expect(mockAreaRefetch).toHaveBeenCalledTimes(1);
    });

    it("saves a new location to the profile, trimmed, and closes the editor", async () => {
      const { getByLabelText, queryByLabelText } = await render(<CalendarScreen />);

      await fireEvent.press(getByLabelText("Change location"));
      expect(getByLabelText("Location").props.value).toBe("Reno, NV");

      await fireEvent.changeText(getByLabelText("Location"), "  Sacramento, CA  ");
      await fireEvent.press(getByLabelText("Save location"));

      expect(mockUpdateProfile).toHaveBeenCalledWith({
        userId: "user-1",
        patch: { location: "Sacramento, CA" },
      });
      expect(queryByLabelText("Location")).toBeNull();
    });

    it("does not write to the profile when the location is unchanged", async () => {
      const { getByLabelText, queryByLabelText } = await render(<CalendarScreen />);

      await fireEvent.press(getByLabelText("Change location"));
      await fireEvent.press(getByLabelText("Save location"));

      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(queryByLabelText("Location")).toBeNull();
    });

    it("refuses to save a location that is too short", async () => {
      const { getByLabelText } = await render(<CalendarScreen />);

      await fireEvent.press(getByLabelText("Change location"));
      await fireEvent.changeText(getByLabelText("Location"), " a ");
      await fireEvent.press(getByLabelText("Save location"));

      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(getByLabelText("Location")).toBeTruthy();
    });

    it("cancel closes the editor without saving", async () => {
      const { getByText, getByLabelText, queryByLabelText } = await render(<CalendarScreen />);

      await fireEvent.press(getByLabelText("Change location"));
      await fireEvent.changeText(getByLabelText("Location"), "Sacramento, CA");
      await fireEvent.press(getByText("Cancel"));

      expect(mockUpdateProfile).not.toHaveBeenCalled();
      expect(queryByLabelText("Location")).toBeNull();
    });
  });

  describe("updating events", () => {
    it("shows how long ago events were updated", async () => {
      const { getByText } = await render(<CalendarScreen />);

      expect(getByText("Events updated 30 min ago")).toBeTruthy();
    });

    it("says never when the area has not been synced", async () => {
      mockUseEventAreaQuery.mockReturnValue(resolvedArea({ lastSyncedAt: null }));
      const { getByText } = await render(<CalendarScreen />);

      expect(getByText("Events updated never")).toBeTruthy();
    });

    it("asks the server to refresh the current location", async () => {
      const { getByLabelText } = await render(<CalendarScreen />);

      await fireEvent.press(getByLabelText("Update events"));

      expect(mockRefreshMutate).toHaveBeenCalledWith({ location: "Reno, NV" });
    });

    it("shows progress and blocks a second tap while updating", async () => {
      mockUseRefresh.mockReturnValue({ data: undefined, isPending: true, isError: false });
      const { getByText, getByLabelText } = await render(<CalendarScreen />);

      expect(getByText("Updating…")).toBeTruthy();
      await fireEvent.press(getByLabelText("Update events"));
      expect(mockRefreshMutate).not.toHaveBeenCalled();
    });

    it("uses the refreshed time once an update succeeds", async () => {
      mockUseRefresh.mockReturnValue({
        data: resolvedArea({ synced: true, lastSyncedAt: new Date(mockNow).toISOString() }).data,
        isPending: false,
        isError: false,
      });
      const { getByText, queryByText } = await render(<CalendarScreen />);

      expect(getByText("Events updated just now")).toBeTruthy();
      expect(queryByText("Already up to date.")).toBeNull();
    });

    it("says already up to date when the server declines to refresh so soon", async () => {
      mockUseRefresh.mockReturnValue({
        data: resolvedArea({ synced: false }).data,
        isPending: false,
        isError: false,
      });
      const { getByText } = await render(<CalendarScreen />);

      expect(getByText("Already up to date.")).toBeTruthy();
    });

    it("keeps showing saved events with a note when the refresh fails", async () => {
      mockUseRefresh.mockReturnValue({
        data: resolvedArea({ synced: false, syncError: "locator responded 503" }).data,
        isPending: false,
        isError: false,
      });
      const { getByText, getAllByText } = await render(<CalendarScreen />);

      expect(getByText("Couldn't update just now. Showing the last saved events.")).toBeTruthy();
      expect(getAllByText("Tuesday Game Store")).toHaveLength(4);
    });

    it("shows the same note when the refresh request itself errors", async () => {
      mockUseRefresh.mockReturnValue({ data: undefined, isPending: false, isError: true });
      const { getByText, getAllByText } = await render(<CalendarScreen />);

      expect(getByText("Couldn't update just now. Showing the last saved events.")).toBeTruthy();
      expect(getAllByText("Tuesday Game Store")).toHaveLength(4);
    });
  });
});
