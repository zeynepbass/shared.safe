import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { CornerMarks } from './CornerMarks';
import { Icon } from './Icon';

const HEIGHTS = { lg: 56, md: 44, sm: 32 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  corners,
  fullWidth = variant !== 'text',
  style,
  accessibilityLabel,
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const inactive = disabled || loading;
  const showCorners = corners ?? (variant === 'primary' && size === 'lg');

  const contentColor = {
    primary: 'textOnPrimary',
    secondary: 'text',
    text: 'primary',
    danger: 'danger',
  }[variant];

  const textVariant = size === 'sm' ? 'bodyStrong' : 'button';
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={variant === 'text' ? theme.layout.hitSlop : undefined}
      style={({ pressed }) => [
        styles.base,
        variant !== 'text' && { height: HEIGHTS[size] },
        size === 'sm' && styles.small,
        styles[variant],
        variant === 'primary' && inactive && styles.primaryDisabled,
        fullWidth ? styles.fullWidth : styles.hug,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {showCorners ? <CornerMarks /> : null}
      {loading ? (
        <ActivityIndicator color={theme.colors[contentColor]} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon icon={icon} size={iconSize} color={contentColor} /> : null}
          {title ? (
            <AppText variant={textVariant} color={contentColor} numberOfLines={1}>
              {title}
            </AppText>
          ) : null}
          {iconRight ? <Icon icon={iconRight} size={iconSize} color={contentColor} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    small: { paddingHorizontal: spacing.md },
    fullWidth: { alignSelf: 'stretch' },
    hug: { alignSelf: 'flex-start' },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    primary: { backgroundColor: colors.primary },
    primaryDisabled: { backgroundColor: colors.primaryDisabled },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    danger: {
      backgroundColor: 'transparent',
      borderWidth: borderWidth.hairline,
      borderColor: colors.danger,
    },
    text: { paddingHorizontal: 0 },
    pressed: { opacity: 0.75 },
  });
