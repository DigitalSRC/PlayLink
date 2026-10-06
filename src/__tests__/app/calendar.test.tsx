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
const wednesdayNight = makeEvent({
  id: "wed",
  venueName: "Wednesday Card Shop",
  dayOfWeek: 3,
  startTime: "17:30:00",
});

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
    mockUseLocalEventsQuery.mockReturnValue(loaded([tuesdayNight, wednesdayNight]));
  });

  it("requests Commander events for the player's area", async () => {
    await render(<CalendarScreen />);

    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("reno-sparks", "Commander");
  });

  it("falls back to Reno-Sparks for a location with no matching area", async () => {
    mockCurrentUser = { location: "Portland, OR" };
    const { getByText } = await render(<CalendarScreen />);

    expect(mockUseLocalEventsQuery).toHaveBeenCalledWith("reno-sparks", "Commander");
    expect(getByText("Reno-Sparks, NV")).toBeTruthy();
  });

  it("opens on the current month with today selected and today's venues listed", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

    expect(getByText("October 2026")).toBeTruthy();
    expect(getByLabelText(/^2026-10-06, today/)).toBeTruthy();
    expect(getByText("Tuesday, October 6")).toBeTruthy();
    expect(getByText("Tuesday Game Store")).toBeTruthy();
    expect(getByText("Casual Commander")).toBeTruthy();
    expect(getByText("6:00 PM – 10:00 PM")).toBeTruthy();
    expect(getByText("123 Example St, Reno, NV")).toBeTruthy();
    expect(getByText("Casual pods")).toBeTruthy();
    expect(queryByText("Wednesday Card Shop")).toBeNull();
  });

  it("marks only the days that have events", async () => {
    const { getByLabelText } = await render(<CalendarScreen />);

    expect(getByLabelText("2026-10-07, has events")).toBeTruthy();
    expect(getByLabelText("2026-10-13, has events")).toBeTruthy();
    expect(getByLabelText("2026-10-08")).toBeTruthy();
  });

  it("shows another day's venues when that day is tapped", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-07, has events"));

    expect(getByText("Wednesday, October 7")).toBeTruthy();
    expect(getByText("Wednesday Card Shop")).toBeTruthy();
    // No end time on this event, so only the start time is shown.
    expect(getByText("5:30 PM")).toBeTruthy();
    expect(queryByText("Tuesday Game Store")).toBeNull();
  });

  it("says so when the tapped day has no Commander night", async () => {
    const { getByText, getByLabelText } = await render(<CalendarScreen />);

    await fireEvent.press(getByLabelText("2026-10-08"));

    expect(getByText("Thursday, October 8")).toBeTruthy();
    expect(getByText("No Commander night on this day.")).toBeTruthy();
  });

  it("clears the selection when the month changes, and Back to today restores it", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<CalendarScreen />);
    expect(queryByText("Back to today")).toBeNull();

    await fireEvent.press(getByLabelText("Next month"));

    expect(getByText("November 2026")).toBeTruthy();
    expect(getByText("Tap a day to see where to play.")).toBeTruthy();
    expect(queryByText("Tuesday Game Store")).toBeNull();

    await fireEvent.press(getByText("Back to today"));

    expect(getByText("October 2026")).toBeTruthy();
    expect(getByText("Tuesday Game Store")).toBeTruthy();
    expect(queryByText("Back to today")).toBeNull();
  });

  it("rolls over the year when stepping back from January", async () => {
    const { getByText, getByLabelText } = await render(<CalendarScreen />);

    for (let i = 0; i < 10; i++) {
      await fireEvent.press(getByLabelText("Previous month"));
    }

    expect(getByText("December 2025")).toBeTruthy();
  });

  it("shows an empty state when the area has no events at all", async () => {
    mockUseLocalEventsQuery.mockReturnValue(loaded([]));
    const { getByText } = await render(<CalendarScreen />);

    expect(getByText("No Commander nights listed yet")).toBeTruthy();
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

    expect(getByText("Couldn't load Commander nights")).toBeTruthy();
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
    expect(getByLabelText(/^2026-10-06, today/)).toBeTruthy();
    expect(queryByText("No Commander nights listed yet")).toBeNull();
  });

  it("renders nothing when there is no current user", async () => {
    mockCurrentUser = null;
    const { toJSON } = await render(<CalendarScreen />);

    expect(toJSON()).toBeNull();
  });
});
