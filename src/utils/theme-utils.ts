import { AppTheme, useApp } from '../context/AppContext';

/**
 * The set of neutral, theme-dependent colors screens pull from instead of hardcoding
 * their own light/dark hex values. Semantic/accent colors (GAME_COLOR, success green,
 * accent blue, rival red/gold/purple) are intentionally NOT part of this palette — those
 * stay constant across themes since they're already saturated enough to read on both a
 * light and a dark surface. This only covers backgrounds, borders, and text tiers, which
 * are the values that actually need to flip for light mode to be legible.
 */
export interface ThemeColors {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  rivalMainBg: string;
  rivalFamiliarFoeBg: string;
  unsavedBanner: string;
}

const THEME_COLORS: Record<AppTheme, ThemeColors> = {
  dark: {
    bg: '#0F0F14',
    card: '#1C1C24',
    cardAlt: '#0F0F14',
    border: '#2C2C38',
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#666666',
    rivalMainBg: '#1F1012',
    rivalFamiliarFoeBg: '#12101F',
    unsavedBanner: '#2A1F00',
  },
  light: {
    bg: '#F2F2F7',
    card: '#FFFFFF',
    cardAlt: '#F2F2F7',
    border: '#E0E0E8',
    textPrimary: '#000000',
    textSecondary: '#666666',
    textMuted: '#8E8E93',
    rivalMainBg: '#FFF0EF',
    rivalFamiliarFoeBg: '#F2EFFC',
    unsavedBanner: '#FFF8E0',
  },
};

/**
 * Returns the full neutral color palette for the app's current theme setting.
 * This is the single source of truth every screen should read backgrounds, borders,
 * and text colors from, instead of each screen hardcoding its own light/dark hex
 * values — that duplication is exactly what let the rivals section on home.tsx go
 * unthemed and stay unreadable in light mode.
 * Parameters: none; reads `theme` from the global AppContext.
 * Returns: a ThemeColors object matching the current 'dark' or 'light' setting.
 * Edge cases: throws if called outside an AppProvider, same as useApp().
 */
export const useThemeColors = (): ThemeColors => {
  const { theme } = useApp();
  return THEME_COLORS[theme];
};
