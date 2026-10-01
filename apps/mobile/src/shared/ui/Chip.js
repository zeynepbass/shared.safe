import { Pressable, StyleSheet } from 'react-native';

import { touchSlop, useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function Chip({
  icon,
  label,
  selected = false,
  disabled = false,
  onPress,
  role = 'radio',
  accessibilityLabel,
  style,
  testID,
}) {
  const { iconSize, layout } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = selected ? 'textOnPrimary' : 'text';
  // VoiceOver reads `selected`, TalkBack reads `checked` for radios and checkboxes.
  const state =
    role === 'checkbox'
      ? { checked: selected, disabled }
      : { selected, checked: selected, disabled };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      testID={testID}
      hitSlop={touchSlop(layout.touchTarget, layout.chipHeight)}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !selected && styles.pressed,
        style,
      ]}
    >
      {icon ? <Icon icon={icon} size={iconSize.sm} color={color} /> : null}
      <AppText variant="caption" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth, radius, opacity }) =>
  StyleSheet.create({
    chip: {
      minHeight: layout.chipHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
      borderRadius: radius.chip,
    },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
    pressed: { backgroundColor: colors.surfaceMuted },
    disabled: { opacity: opacity.disabled },
  });
