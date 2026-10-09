import { fireEvent, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Platform, Text } from "react-native";
import { RefreshableScrollView } from "../../components/RefreshableScrollView";
import { PULL_TRIGGER_PX } from "../../utils/refresh-utils";

jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ theme: "dark" }),
}));

const touch = (pageY: number) => ({ nativeEvent: { touches: [{ pageY }] } });
const lift = { nativeEvent: { touches: [] } };
const scrollTo = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } });
// Finger travel that opens the indicator to exactly the trigger distance (travel is halved).
const FAR = PULL_TRIGGER_PX * 2;

describe("RefreshableScrollView", () => {
  const originalOS = Platform.OS;
  const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, "OS", { value: os, configurable: true });

  afterEach(() => {
    setOS(originalOS);
  });

  describe("on a phone", () => {
    beforeEach(() => {
      setOS("ios");
    });

    it("uses the platform's own pull-to-refresh, wired to onRefresh", async () => {
      const onRefresh = jest.fn();
      const { getByTestId, getByText } = await render(
        <RefreshableScrollView testID="list" refreshing={false} onRefresh={onRefresh}>
          <Text>content</Text>
        </RefreshableScrollView>
      );

      const control = getByTestId("list").props.refreshControl;
      expect(control.props.refreshing).toBe(false);
      control.props.onRefresh();
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(getByText("content")).toBeTruthy();
    });

    it("shows the spinner while refreshing", async () => {
      const { getByTestId } = await render(
        <RefreshableScrollView testID="list" refreshing onRefresh={jest.fn()} />
      );
      expect(getByTestId("list").props.refreshControl.props.refreshing).toBe(true);
    });
  });

  describe("in a web browser", () => {
    beforeEach(() => {
      setOS("web");
    });

    const renderWeb = (props: { refreshing?: boolean; onRefresh?: () => void; onScroll?: () => void } = {}) =>
      render(
        <RefreshableScrollView
          testID="list"
          refreshing={props.refreshing ?? false}
          onRefresh={props.onRefresh ?? jest.fn()}
          onScroll={props.onScroll}
        >
          <Text>content</Text>
        </RefreshableScrollView>
      );

    it("refreshes when pulled down far enough from the top and let go", async () => {
      const onRefresh = jest.fn();
      const { getByTestId } = await renderWeb({ onRefresh });
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(100 + FAR));
      await fireEvent(list, "touchEnd", lift);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("says to pull, then to release, as the pull grows, and hides it again on release", async () => {
      const { getByTestId, getByText, queryByText } = await renderWeb();
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(140));
      expect(getByText("↓ Pull to refresh")).toBeTruthy();

      await fireEvent(list, "touchMove", touch(100 + FAR));
      expect(getByText("↑ Release to refresh")).toBeTruthy();

      await fireEvent(list, "touchEnd", lift);
      expect(queryByText("↑ Release to refresh")).toBeNull();
      expect(queryByText("↓ Pull to refresh")).toBeNull();
    });

    it("ignores a short pull", async () => {
      const onRefresh = jest.fn();
      const { getByTestId } = await renderWeb({ onRefresh });
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(100 + FAR - 4));
      await fireEvent(list, "touchEnd", lift);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("ignores a pull that starts part-way down the list", async () => {
      const onRefresh = jest.fn();
      const { getByTestId, queryByText } = await renderWeb({ onRefresh });
      const list = getByTestId("list");

      await fireEvent.scroll(list, scrollTo(300));
      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(100 + FAR));
      expect(queryByText("↑ Release to refresh")).toBeNull();
      await fireEvent(list, "touchEnd", lift);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("cancels the pull if the list scrolls down during it", async () => {
      const onRefresh = jest.fn();
      const { getByTestId } = await renderWeb({ onRefresh });
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent.scroll(list, scrollTo(40));
      await fireEvent(list, "touchMove", touch(100 + FAR));
      await fireEvent(list, "touchEnd", lift);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("ignores pulls while a refresh is already running", async () => {
      const onRefresh = jest.fn();
      const { getByTestId } = await renderWeb({ refreshing: true, onRefresh });
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(100 + FAR));
      await fireEvent(list, "touchEnd", lift);

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("treats a cancelled touch like a release", async () => {
      const onRefresh = jest.fn();
      const { getByTestId } = await renderWeb({ onRefresh });
      const list = getByTestId("list");

      await fireEvent(list, "touchStart", touch(100));
      await fireEvent(list, "touchMove", touch(100 + FAR));
      await fireEvent(list, "touchCancel", lift);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("still passes scroll events to the screen's own handler", async () => {
      const onScroll = jest.fn();
      const { getByTestId } = await renderWeb({ onScroll });

      await fireEvent.scroll(getByTestId("list"), scrollTo(10));
      expect(onScroll).toHaveBeenCalledTimes(1);
    });

    it("draws no RefreshControl, which does nothing in a browser", async () => {
      const { getByTestId } = await renderWeb();
      expect(getByTestId("list").props.refreshControl).toBeUndefined();
    });
  });
});
