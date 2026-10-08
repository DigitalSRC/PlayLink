import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Alert } from "react-native";
import { DialogHost, showDialog } from "../../components/AppDialog";

jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ theme: "dark" }),
}));

// Asking for a dialog updates the mounted host, so it has to happen inside act().
const open = (...args: Parameters<typeof showDialog>) =>
  act(async () => {
    showDialog(...args);
  });

describe("showDialog", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("with no DialogHost mounted", () => {
    it("falls back to Alert.alert with exactly the arguments it was given", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const buttons = [{ text: "Cancel", style: "cancel" as const }, { text: "Delete" }];

      showDialog("Only a title");
      showDialog("Title", "Message");
      showDialog("Title", "Message", buttons);

      expect(alertSpy.mock.calls).toEqual([["Only a title"], ["Title", "Message"], ["Title", "Message", buttons]]);
    });
  });

  describe("with a DialogHost mounted", () => {
    it("shows the title and message with a single OK button by default, and never touches Alert", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const { getByText, queryByText } = await render(<DialogHost />);
      expect(queryByText("Group posted!")).toBeNull();

      await open("Group posted!", "Other players can now find it.");

      expect(getByText("Group posted!")).toBeTruthy();
      expect(getByText("Other players can now find it.")).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalled();

      await fireEvent.press(getByText("OK"));
      expect(queryByText("Group posted!")).toBeNull();
    });

    it("runs the chosen button's action and closes", async () => {
      const onDelete = jest.fn();
      const onCancel = jest.fn();
      const { getByText, queryByText } = await render(<DialogHost />);

      await open("Delete this posting?", "This can't be undone.", [
        { text: "Cancel", style: "cancel", onPress: onCancel },
        { text: "Delete Posting", style: "destructive", onPress: onDelete },
      ]);
      await fireEvent.press(getByText("Delete Posting"));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(queryByText("Delete this posting?")).toBeNull();
    });

    it("takes the cancel button when the area outside the card is tapped", async () => {
      const onDelete = jest.fn();
      const onCancel = jest.fn();
      const { getByLabelText, queryByText } = await render(<DialogHost />);

      await open("Delete this posting?", undefined, [
        { text: "Cancel", style: "cancel", onPress: onCancel },
        { text: "Delete Posting", style: "destructive", onPress: onDelete },
      ]);
      await fireEvent.press(getByLabelText("Close"));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onDelete).not.toHaveBeenCalled();
      expect(queryByText("Delete this posting?")).toBeNull();
    });

    it("keeps a real choice open when there is no cancel button to fall back on", async () => {
      const { getByLabelText, getByText } = await render(<DialogHost />);

      await open("Pick one", undefined, [{ text: "This" }, { text: "That" }]);
      await fireEvent.press(getByLabelText("Close"));

      expect(getByText("Pick one")).toBeTruthy();
      await fireEvent.press(getByText("This"));
    });

    it("shows dialogs one at a time, in the order they were asked for", async () => {
      const { getByText, queryByText } = await render(<DialogHost />);

      await open("Group posted!");
      await open("+25 points");

      expect(getByText("Group posted!")).toBeTruthy();
      expect(queryByText("+25 points")).toBeNull();

      await fireEvent.press(getByText("OK"));
      expect(queryByText("Group posted!")).toBeNull();
      expect(getByText("+25 points")).toBeTruthy();

      await fireEvent.press(getByText("OK"));
      expect(queryByText("+25 points")).toBeNull();
    });

    it("shows a dialog opened from inside a button's action", async () => {
      const { getByText } = await render(<DialogHost />);

      await open("Leave this group?", undefined, [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => showDialog("You left the group") },
      ]);
      await fireEvent.press(getByText("Leave"));

      expect(getByText("You left the group")).toBeTruthy();
      await fireEvent.press(getByText("OK"));
    });
  });
});
