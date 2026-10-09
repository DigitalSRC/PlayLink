import { AppTheme, useApp } from '../context/AppContext';

/**
 * The set of theme-dependent colors screens pull from instead of hardcoding their own light/dark
 * hex values. It covers the neutrals (backgrounds, borders, text tiers) and the tinted surfaces
 * that sit behind an accent: a "selected" chip, a success badge, a danger chip, the rank card.
 * Those tints were once fixed near-black values (a dark navy, a dark maroon), which is what made
 * selected chips, the rival card, and the whole group page unreadable in light mode.
 * The saturated accents themselves (GAME_COLOR, the blue/green/red buttons, rival red and gold)
 * are intentionally NOT here: they read on both a light and a dark surface and stay constant.
 */
export interface ThemeColors {
  bg: string;
  card: string;
  cardAlt: string;
  /** A surface one step lighter than `card`, for content that must stand out from the page. */
  cardRaised: string;
  /** Body text for dense detail lines: quieter than textPrimary, clearer than textSecondary. */
  textBody: string;
  /** Accent blue tuned for small text: brighter on dark surfaces, deeper on light ones. */
  accentText: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Hint text inside an empty input. */
  placeholder: string;
  rivalMainBg: string;
  rivalFamiliarFoeBg: string;
  unsavedBanner: string;
  /** Behind something selected or highlighted in blue (a chosen chip, your own leaderboard row). */
  accentBg: string;
  /** Text sitting on accentBg. */
  accentOnBg: string;
  /** Behind a success badge ("You're in this group", "Round 2 Final"). */
  successBg: string;
  /** Green tuned for text: the bright green on dark, a deeper one on light. */
  successText: string;
  /** Behind a selected "won't play against" chip or a leave button. */
  dangerBg: string;
  /** Text sitting on dangerBg. */
  dangerOnBg: string;
  /** Behind a gold call-out (Make Host). */
  warnBg: string;
  /** Gold tuned for text: bright on dark, a deeper amber on light. */
  warnText: string;
  /** The leaderboard rank card and the score badge inside it. */
  purpleBg: string;
  purpleBgAlt: string;
  purpleText: string;
  purpleTextSoft: string;
  /** A button that can't be pressed right now. */
  disabledBg: string;
}

const THEME_COLORS: Record<AppTheme, ThemeColors> = {
  dark: {
    bg: '#0F0F14',
    card: '#1C1C24',
    cardAlt: '#0F0F14',
    cardRaised: '#2B2B38',
    textBody: '#D2D2DC',
    accentText: '#6CB6FF',
    border: '#2C2C38',
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#666666',
    placeholder: '#555555',
    rivalMainBg: '#1F1012',
    rivalFamiliarFoeBg: '#12101F',
    unsavedBanner: '#2A1F00',
    accentBg: '#001A33',
    accentOnBg: '#FFFFFF',
    successBg: '#0D2A15',
    successText: '#34C759',
    dangerBg: '#3D1215',
    dangerOnBg: '#FFFFFF',
    warnBg: '#2C1A00',
    warnText: '#E6A817',
    purpleBg: '#1A0A2A',
    purpleBgAlt: '#2A1A3A',
    purpleText: '#A07FDF',
    purpleTextSoft: '#8B6FBF',
    disabledBg: '#2C2C38',
  },
  light: {
    bg: '#F2F2F7',
    card: '#FFFFFF',
    cardAlt: '#F2F2F7',
    cardRaised: '#FFFFFF',
    textBody: '#3A3A44',
    accentText: '#0062CC',
    border: '#E0E0E8',
    textPrimary: '#000000',
    textSecondary: '#666666',
    textMuted: '#8E8E93',
    placeholder: '#A0A0AA',
    rivalMainBg: '#FFF0EF',
    rivalFamiliarFoeBg: '#F2EFFC',
    unsavedBanner: '#FFF8E0',
    accentBg: '#E1EEFF',
    accentOnBg: '#004C9E',
    successBg: '#E3F6E8',
    successText: '#1B7F37',
    dangerBg: '#FDE7E4',
    dangerOnBg: '#A5281B',
    warnBg: '#FFF4D6',
    warnText: '#8B6000',
    purpleBg: '#F1EAFB',
    purpleBgAlt: '#E6DAF8',
    purpleText: '#5B3FA0',
    purpleTextSoft: '#7B5FAF',
    disabledBg: '#C9C9D2',
  },
};

/**
 * Returns the full color palette for the app's current theme setting.
 * This is the single source of truth every screen should read backgrounds, borders, text
 * colors, and tinted surfaces from, instead of each screen hardcoding its own light/dark hex
 * values — that duplication is exactly what let whole screens stay dark in light mode.
 * Parameters: none; reads `theme` from the global AppContext.
 * Returns: a ThemeColors object matching the current 'dark' or 'light' setting.
 * Edge cases: throws if called outside an AppProvider, same as useApp(); a theme value that is
 * neither 'dark' nor 'light' gets the dark palette.
 */
export const useThemeColors = (): ThemeColors => {
  const { theme } = useApp();
  // Falls back to dark for anything unexpected rather than handing a screen no palette at all.
  return THEME_COLORS[theme] ?? THEME_COLORS.dark;
};
