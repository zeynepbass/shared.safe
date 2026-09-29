import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/shared/theme';

import { Icon } from './Icon';

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  color = 'text',
  disabled,
  style,
}) {
  const { layout } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={layout.hitSlop}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, style]}
    >
      <Icon icon={icon} size={size} color={disabled ? 'textSubtle' : color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
