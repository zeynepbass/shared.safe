import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { touchSlop, useThemedStyles } from '@/shared/theme';

const TRACK_WIDTH = 32;
const THUMB = 14;
const PADDING = 3;
const TRACK_HEIGHT = THUMB + PADDING * 2 + 2;

export function Switch({ value, onChange, disabled, accessibilityLabel, testID }) {
  const styles = useThemedStyles(createStyles);
  const progress = useState(() => new Animated.Value(value ? 1 : 0))[0];

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_WIDTH - THUMB - PADDING * 2 - 2],
  });

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={touchSlop(TRACK_WIDTH, TRACK_HEIGHT)}
      style={[styles.track, value && styles.trackOn, disabled && styles.disabled]}
    >
      <Animated.View
        style={[styles.thumb, value && styles.thumbOn, { transform: [{ translateX }] }]}
      />
    </Pressable>
  );
}

const createStyles = ({ colors, borderWidth }) =>
  StyleSheet.create({
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      padding: PADDING,
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.controlBorder,
      backgroundColor: colors.surface,
    },
    trackOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    thumb: { width: THUMB, height: THUMB, backgroundColor: colors.textMuted },
    thumbOn: { backgroundColor: colors.bg },
    disabled: { opacity: 0.5 },
  });
