import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../utils/theme-utils";

const DAYS_SHOWN = 15;

interface DateOffsetPickerProps {
  value: number;
  onChange: (offset: number) => void;
}

/**
 * A horizontal chip row letting the user pick a day within the next 15 days ("Today",
 * "Tomorrow", then "Wed, Jul 22" etc.), the same rolling-offset date picker browse.tsx's
 * create-group form originally built inline. Pulled out into a shared component so both the
 * create form and group-detail's edit form use one implementation instead of two near-duplicates.
 * Parameters: value (the currently selected day offset, 0 = today), onChange (called with the
 * newly selected offset when a chip is tapped).
 * Returns: a horizontally-scrolling row of day chips.
 * Edge cases: none beyond normal invalid input handling.
 */
export default function DateOffsetPicker({ value, onChange }: DateOffsetPickerProps) {
  const colors = useThemeColors();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {Array.from({ length: DAYS_SHOWN }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const label =
          i === 0
            ? "Today"
            : i === 1
              ? "Tomorrow"
              : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return (
          <Pressable
            key={i}
            style={[styles.chip, { backgroundColor: colors.bg, borderColor: colors.border }, value === i && styles.chipActive]}
            onPress={() => {
              onChange(i);
              Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.chipText, value === i && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 6,
    paddingBottom: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  chipActive: {
    backgroundColor: "#001A33",
    borderColor: "#007AFF",
  },
  chipText: {
    fontSize: 12,
    color: "#888",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFF",
  },
});
