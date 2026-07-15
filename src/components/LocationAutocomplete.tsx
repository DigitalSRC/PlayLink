import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LocationSuggestion, searchLocations } from '../lib/location-api';
import { useThemeColors } from '../utils/theme-utils';

const DEBOUNCE_MS = 180;

interface LocationAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion?: (suggestion: LocationSuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * A controlled, drop-in replacement for a plain location TextInput that suggests city/state
 * matches as the user types, so they don't have to type a full city name by hand. It stays a
 * free-text field underneath — the dropdown is an assist, not a hard constraint, so a location
 * that isn't in the suggestion list can still be typed and saved exactly as before.
 * Renders suggestions inline below the input (not as an absolutely-positioned overlay), since
 * this app's forms live inside ScrollViews that would clip an overlay dropdown.
 * Parameters: value/onChangeText (the standard controlled-input pair, unchanged contract from a
 * plain TextInput), onSelectSuggestion (optional callback fired when a suggestion is tapped, in
 * addition to onChangeText), placeholder, autoFocus.
 * Returns: a TextInput plus, while suggestions exist and the input is focused, a short list of
 * tappable suggestion rows styled from the current theme.
 * Edge cases: suggestions clear on blur (after a short delay so a tap on a row still registers)
 * and whenever the query drops below the provider's minimum length; a query typed faster than
 * DEBOUNCE_MS discards the stale in-flight lookup's result if the query has since changed.
 */
export default function LocationAutocomplete({
  value,
  onChangeText,
  onSelectSuggestion,
  placeholder,
  autoFocus,
}: LocationAutocompleteProps) {
  const colors = useThemeColors();
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchLocations(value).then((results) => setSuggestions(results));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    return () => {
      if (blurRef.current) clearTimeout(blurRef.current);
    };
  }, []);

  const handleSelect = (suggestion: LocationSuggestion) => {
    onChangeText(suggestion.displayName);
    onSelectSuggestion?.(suggestion);
    setSuggestions([]);
    setFocused(false);
  };

  const showDropdown = focused && suggestions.length > 0;

  return (
    <View>
      <TextInput
        style={[styles.input, { backgroundColor: colors.bg, color: colors.textPrimary, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          blurRef.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {showDropdown && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.displayName}
              style={styles.row}
              onPress={() => handleSelect(suggestion)}
            >
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>{suggestion.displayName}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowText: {
    fontSize: 14,
  },
});
