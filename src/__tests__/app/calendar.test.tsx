import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import CalendarScreen from "../../app/(tabs)/calendar";
import { LocalEvent } from "../../data/local-events";

// Tuesday, October 6, 2026 at noon local time.
const mockNow = new Date(2026, 9, 6, 12, 0).getTime();

let mockCurrentUser: { location: string } | null = { location: "Reno, NV" };
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ currentUser: mockCurrentUser, getNow: () => mockNow, theme: "dark" }),
}));

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
}));

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
    mockCurrentUser = { location: "Reno, NV" };
    mockUseLocalEventsQuery.mockReturnValue(loaded(allEvents));
  });

  it("requests every format for the player's area, so switching needs no refetch", async () => {
    await render(<CalendarScreen />);

    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("reno-sparks", undefined);
  });

  it("falls back to Reno-Sparks for a location with no matching area", async () => {
    mockCurrentUser = { location: "Portland, OR" };
    const { getByText } = await render(<CalendarScreen />);

    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("reno-sparks", undefined);
    expect(getByText("Reno-Sparks, NV")).toBeTruthy();
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

  it("switches format from the chips, changing both the grid and the list", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("Show Booster Draft events"));

    expect(getByText("Showing Booster Draft events")).toBeTruthy();
    expect(getByLabelText("2026-10-09, Draft")).toBeTruthy();
    expect(getByLabelText("2026-10-07")).toBeTruthy();
    expect(getByText("Friday, October 9")).toBeTruthy();
    expect(getByText("Draft House")).toBeTruthy();
    expect(getByText("Friday Draft")).toBeTruthy();
    expect(queryByText("Tuesday Game Store")).toBeNull();

    await fireEvent.press(getByLabelText("Show Commander events"));
    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(queryByText("Draft House")).toBeNull();
  });

  it("hides the switcher when there is only one format", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([tuesdayNight, wednesdayNight]));
    const { getByText, queryByLabelText } = await render(<CalendarScreen />);

    expect(getByText("Showing Commander events")).toBeTruthy();
    expect(queryByLabelText("Show Commander events")).toBeNull();
  });

  it("shows the first available format when there are no Commander events", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([fridayDraft]));
    const { getByText } = await render(<CalendarScreen />);

    expect(getByText("Showing Booster Draft events")).toBeTruthy();
    expect(getByText("Draft House")).toBeTruthy();
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

    expect(getByText("No events listed yet")).toBeTruthy();
    expect(getByText(/Nothing has been added for Reno-Sparks, NV/)).toBeTruthy();
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
    expect(queryByText("No events listed yet")).toBeNull();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<CalendarScreen />);

    expect(toJSON()).toBeNull();
  });
});
