import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { CornerMarks } from './CornerMarks';
import { Icon } from './Icon';

const CONTENT_COLOR = {
  primary: 'textOnPrimary',
  secondary: 'text',
  ghost: 'primary',
  danger: 'danger',
};

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
  fullWidth = variant !== 'ghost',
  style,
  accessibilityLabel,
  accessibilityHint,
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const inactive = disabled || loading;
  const isGhost = variant === 'ghost';
  const showCorners = corners ?? (variant === 'primary' && size === 'lg');
  const contentColor = CONTENT_COLOR[variant];
  const textVariant = size === 'sm' ? 'bodyStrong' : 'button';
  const iconSize = size === 'sm' ? theme.iconSize.sm : theme.iconSize.lg;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={isGhost ? theme.layout.hitSlop : undefined}
      style={({ pressed }) => [
        styles.base,
        !isGhost && { height: theme.controlHeight[size] },
        size === 'sm' && styles.small,
        styles[variant],
        inactive && (variant === 'primary' ? styles.primaryDisabled : styles.disabled),
        loading && styles.loading,
        fullWidth ? styles.fullWidth : styles.hug,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {showCorners ? <CornerMarks /> : null}
      {loading ? (
        <ActivityIndicator
          color={theme.colors[contentColor]}
          size="small"
          style={isGhost ? null : StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[styles.content, loading && !isGhost && styles.hidden]}>
        {icon ? <Icon icon={icon} size={iconSize} color={contentColor} /> : null}
        {title ? (
          <AppText variant={textVariant} color={contentColor} numberOfLines={1}>
            {title}
          </AppText>
        ) : null}
        {iconRight ? <Icon icon={iconRight} size={iconSize} color={contentColor} /> : null}
      </View>
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, borderWidth, radius, opacity }) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radius.control,
    },
    small: { paddingHorizontal: spacing.md },
    fullWidth: { alignSelf: 'stretch' },
    hug: { alignSelf: 'flex-start' },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    hidden: { opacity: 0 },
    primary: { backgroundColor: colors.primary },
    primaryDisabled: { backgroundColor: colors.primaryDisabled },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    ghost: { paddingHorizontal: spacing.none, gap: spacing.sm },
    danger: {
      backgroundColor: 'transparent',
      borderWidth: borderWidth.hairline,
      borderColor: colors.danger,
    },
    disabled: { opacity: opacity.disabled },
    loading: { opacity: 1 },
    pressed: { opacity: opacity.pressed },
  });
