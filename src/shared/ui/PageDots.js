import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

export function PageDots({ count, index }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.active]} />
      ))}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    dot: {
      width: 7,
      height: 7,
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    active: { width: 18, backgroundColor: colors.primary, borderColor: colors.primary },
  });
