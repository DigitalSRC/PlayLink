import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../utils/theme-utils";

export interface TimeOfDayValue {
  hour: number;
  minute: number;
  period: "AM" | "PM";
}

interface TimeOfDayPickerProps {
  value: TimeOfDayValue;
  onChange: (next: TimeOfDayValue) => void;
}

/**
 * An hour/minute stepper plus an AM/PM toggle, the same 15-minute-increment time picker
 * browse.tsx's create-group form originally built inline (and group-detail.tsx's edit form
 * duplicated separately). Pulled into a shared component so both forms use one implementation.
 * Parameters: value (the currently selected hour 1-12, minute 0/15/30/45, and AM/PM period),
 * onChange (called with the full next TimeOfDayValue whenever any control is pressed).
 * Returns: an hour stepper, a minute stepper, and an AM/PM toggle in a single row.
 * Edge cases: hour wraps 12 -> 1 going up and 1 -> 12 going down; minute wraps 45 -> 0 going up
 * and 0 -> 45 going down, matching a 12-hour clock face rather than clamping at the boundary.
 */
export default function TimeOfDayPicker({ value, onChange }: TimeOfDayPickerProps) {
  const colors = useThemeColors();
  const { hour, minute, period } = value;

  const bump = (next: Partial<TimeOfDayValue>) => {
    Haptics.selectionAsync();
    onChange({ ...value, ...next });
  };

  return (
    <View style={[styles.picker, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.unit}>
        <Pressable style={styles.arrow} onPress={() => bump({ hour: hour === 12 ? 1 : hour + 1 })}>
          <Text style={styles.arrowText}>▲</Text>
        </Pressable>
        <Text style={[styles.value, { color: colors.textPrimary }]}>{String(hour).padStart(2, "0")}</Text>
        <Pressable style={styles.arrow} onPress={() => bump({ hour: hour === 1 ? 12 : hour - 1 })}>
          <Text style={styles.arrowText}>▼</Text>
        </Pressable>
      </View>
      <Text style={styles.separator}>:</Text>
      <View style={styles.unit}>
        <Pressable style={styles.arrow} onPress={() => bump({ minute: (minute + 15) % 60 })}>
          <Text style={styles.arrowText}>▲</Text>
        </Pressable>
        <Text style={[styles.value, { color: colors.textPrimary }]}>{String(minute).padStart(2, "0")}</Text>
        <Pressable style={styles.arrow} onPress={() => bump({ minute: minute === 0 ? 45 : minute - 15 })}>
          <Text style={styles.arrowText}>▼</Text>
        </Pressable>
      </View>
      <View style={styles.periodGroup}>
        <Pressable
          style={[styles.periodBtn, { backgroundColor: colors.card, borderColor: colors.border }, period === "AM" && styles.periodBtnActive]}
          onPress={() => bump({ period: "AM" })}
        >
          <Text style={[styles.periodText, period === "AM" && styles.periodTextActive]}>AM</Text>
        </Pressable>
        <Pressable
          style={[styles.periodBtn, { backgroundColor: colors.card, borderColor: colors.border }, period === "PM" && styles.periodBtnActive]}
          onPress={() => bump({ period: "PM" })}
        >
          <Text style={[styles.periodText, period === "PM" && styles.periodTextActive]}>PM</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  unit: {
    alignItems: "center",
    gap: 4,
  },
  arrow: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  arrowText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "700",
  },
  value: {
    fontSize: 26,
    fontWeight: "800",
    minWidth: 42,
    textAlign: "center",
  },
  separator: {
    fontSize: 26,
    fontWeight: "800",
    color: "#555",
    marginBottom: 2,
  },
  periodGroup: {
    gap: 6,
    marginLeft: 4,
  },
  periodBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  periodBtnActive: {
    backgroundColor: "#001A33",
    borderColor: "#007AFF",
  },
  periodText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
  },
  periodTextActive: {
    color: "#007AFF",
  },
});
