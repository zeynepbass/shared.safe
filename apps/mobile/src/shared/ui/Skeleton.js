import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

export function Skeleton({ width = '100%', height, style }) {
  const { colors, opacity: opacityTokens, motion, spacing, radius } = useTheme();
  const opacity = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    let loop;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: opacityTokens.skeletonLow,
            duration: motion.slow,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, { toValue: 1, duration: motion.slow, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity, opacityTokens.skeletonLow, motion.slow]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height: height ?? spacing.md,
          borderRadius: radius.none,
          backgroundColor: colors.skeleton,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonListItem({ divider = true }) {
  const { layout, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Skeleton width={layout.iconBox} height={layout.iconBox} />
      <View style={styles.lines}>
        <Skeleton width="60%" height={spacing.sm + spacing.xxs} />
        <Skeleton width="85%" height={spacing.sm} />
      </View>
      <Skeleton width={spacing.huge + spacing.sm} height={spacing.sm + spacing.xxs} />
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    row: {
      minHeight: layout.rowHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.md,
    },
    divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.divider },
    lines: { flex: 1, gap: spacing.sm },
  });
