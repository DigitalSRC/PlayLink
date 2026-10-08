import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Cosmetics } from '../data/shop';
import { borderStyleFor, safeNameColor } from '../utils/shop-utils';
import { useThemeColors } from '../utils/theme-utils';

interface PlayerNameProps {
  /** The name to show (display name or username - the caller decides which). */
  name: string;
  /** What the player is wearing; pass their profile's title and nameColor. */
  cosmetics?: Cosmetics;
  /** The screen's own style for the name. A bought name color overrides only its color. */
  style?: StyleProp<TextStyle>;
  /** Style for the title line, if the screen wants to adjust it. */
  titleStyle?: StyleProp<TextStyle>;
  /** Set false where there is only room for the name (e.g. a tight leaderboard row). */
  showTitle?: boolean;
}

/**
 * A player's name the way they've dressed it up in the shop: written in their bought name
 * color, with their title on a line underneath. Every screen that shows another player's name
 * should use this, so a purchase shows up everywhere at once.
 * Parameters: name, cosmetics, style, titleStyle, showTitle (see PlayerNameProps).
 * Returns: the name, and the title beneath it when there is one. The two are siblings, so put
 * them in a column (a plain View) wherever the parent lays its children out in a row.
 * Edge cases: with no cosmetics, or a color that isn't a valid "#RRGGBB", the name renders in
 * the screen's own style exactly as plain text would; an empty title is not shown.
 */
export default function PlayerName({ name, cosmetics, style, titleStyle, showTitle = true }: PlayerNameProps) {
  const colors = useThemeColors();
  const color = safeNameColor(cosmetics?.nameColor);
  const title = cosmetics?.title?.trim();
  return (
    <>
      <Text style={[style, color !== undefined && { color }]}>{name}</Text>
      {showTitle && !!title && <Text style={[styles.title, { color: colors.textSecondary }, titleStyle]}>{title}</Text>}
    </>
  );
}

interface CosmeticBorderProps {
  /** The profile's cardBorder key. */
  borderKey?: string;
  /** Corner radius of the card being framed, so the border follows its shape. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Draws a bought card border around whatever it wraps. A border is one line, or two lines of
 * different colors one inside the other, built from plain views so it needs no artwork.
 * Parameters: borderKey, radius, style, children (see CosmeticBorderProps).
 * Returns: the children, framed when the player has a border on.
 * Edge cases: with no border, or a key this build doesn't know how to draw, it renders the
 * children in a plain wrapper with no frame and no extra spacing.
 */
export function CosmeticBorder({ borderKey, radius = 16, style, children }: CosmeticBorderProps) {
  const border = borderStyleFor(borderKey);
  if (!border) return <View style={style}>{children}</View>;
  return (
    <View style={[style, { borderWidth: border.width, borderColor: border.outer, borderRadius: radius + border.width * 2 }]}>
      <View
        style={
          border.inner !== undefined
            ? { borderWidth: border.width, borderColor: border.inner, borderRadius: radius + border.width }
            : undefined
        }
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    marginTop: 1,
  },
});
