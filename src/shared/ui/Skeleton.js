import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import { useTheme } from '@/shared/theme';

export function Skeleton({ width = '100%', height = 12, style }) {
  const { colors } = useTheme();
  const opacity = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, backgroundColor: colors.skeleton, opacity }, style]}
    />
  );
}
