import { Pressable, StyleSheet } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function Chip({ icon, label, selected, onPress }) {
  const styles = useThemedStyles(createStyles);
  const color = selected ? 'textOnPrimary' : 'text';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.selected]}
    >
      {icon ? <Icon icon={icon} size={14} color={color} /> : null}
      <AppText variant="caption" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    chip: {
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  });
