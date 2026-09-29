import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

export function ColorPicker({ colors, value, onChange, accessibilityLabel }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {colors.map((color, index) => {
        const selected = color === value;
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${accessibilityLabel ?? ''} ${index + 1}`.trim()}
            style={[styles.ring, selected && styles.ringSelected]}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
    ring: {
      width: 40,
      height: 40,
      padding: 3,
      borderWidth: borderWidth.thick,
      borderColor: 'transparent',
    },
    ringSelected: { borderColor: colors.text },
    swatch: { flex: 1 },
  });
