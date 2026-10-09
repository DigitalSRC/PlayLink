import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { isPullFarEnough, pullDistance } from '../utils/refresh-utils';
import { useThemeColors } from '../utils/theme-utils';

interface RefreshableScrollViewProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void;
}

/** Height the indicator holds while a web refresh runs, so the spinner has room. */
const WEB_SPINNER_HEIGHT = 48;

// Reads the finger's vertical page position from a touch event, which on web is the browser's
// own TouchEvent (position under touches[0]) and on native already flattened onto nativeEvent.
const touchY = (e: GestureResponderEvent): number | null => {
  const ne = e.nativeEvent as unknown as { touches?: ArrayLike<{ pageY: number }>; pageY?: number };
  if (ne.touches && ne.touches.length > 0) return ne.touches[0].pageY;
  return typeof ne.pageY === 'number' ? ne.pageY : null;
};

/**
 * A ScrollView the player can pull down from the top to refresh the screen.
 * On a phone it uses the platform's own pull-to-refresh (RefreshControl). In a web browser
 * React Native's RefreshControl draws nothing and never fires, so there the same gesture is
 * built from touch events: pulling down while the list is at its top opens an indicator
 * ("Pull to refresh", then "Release to refresh"), and letting go far enough calls onRefresh.
 * Parameters: refreshing (true while a refresh runs; shows the spinner), onRefresh (starts one),
 * plus any ScrollView prop, passed through unchanged.
 * Returns: the scroll view element.
 * Edge cases: on web a pull that starts below the top, or while a refresh is already running,
 * is ignored; a desktop mouse cannot pull (no touch events), so there the tab-switch refresh
 * is the way to reload; the screen's own onScroll and touch handlers still receive every event.
 */
export function RefreshableScrollView({ refreshing, onRefresh, children, ...rest }: RefreshableScrollViewProps) {
  const colors = useThemeColors();
  const scrollYRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);

  if (Platform.OS !== 'web') {
    return (
      <ScrollView
        {...rest}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        {children}
      </ScrollView>
    );
  }

  const setPullBoth = (value: number) => {
    pullRef.current = value;
    setPull(value);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    rest.onScroll?.(e);
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    startYRef.current = scrollYRef.current <= 0 && !refreshing ? touchY(e) : null;
    rest.onTouchStart?.(e);
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    const y = touchY(e);
    if (startYRef.current !== null && y !== null) {
      // Scrolling back down into the list mid-gesture cancels the pull.
      if (scrollYRef.current > 0) {
        startYRef.current = null;
        setPullBoth(0);
      } else {
        setPullBoth(pullDistance(y - startYRef.current));
      }
    }
    rest.onTouchMove?.(e);
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (startYRef.current !== null && isPullFarEnough(pullRef.current)) onRefresh();
    startYRef.current = null;
    setPullBoth(0);
    rest.onTouchEnd?.(e);
  };

  const indicatorHeight = refreshing ? WEB_SPINNER_HEIGHT : pull;

  return (
    <ScrollView
      {...rest}
      scrollEventThrottle={rest.scrollEventThrottle ?? 16}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {indicatorHeight > 0 && (
        <View style={[styles.indicator, { height: indicatorHeight }]}>
          {refreshing ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <Text style={[styles.indicatorText, { color: colors.textMuted }]}>
              {isPullFarEnough(pull) ? '↑ Release to refresh' : '↓ Pull to refresh'}
            </Text>
          )}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  indicator: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingBottom: 10,
  },
  indicatorText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
