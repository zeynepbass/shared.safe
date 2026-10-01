import { Pressable, StyleSheet } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { Icon } from './Icon';

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size,
  color = 'text',
  disabled,
  style,
  testID,
}) {
  const { layout, iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      hitSlop={layout.hitSlop}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, style]}
    >
      <Icon icon={icon} size={size ?? iconSize.xxl} color={disabled ? 'textSubtle' : color} />
    </Pressable>
  );
}

const createStyles = ({ layout, opacity }) =>
  StyleSheet.create({
    base: {
      width: layout.iconButton,
      height: layout.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: opacity.pressedSubtle },
  });
