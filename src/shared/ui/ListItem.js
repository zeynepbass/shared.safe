import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function ListItem({
  leading,
  title,
  titleAccessory,
  subtitle,
  trailing,
  trailingCaption,
  value,
  chevron = false,
  onPress,
  onLongPress,
  disabled = false,
  divider = true,
  accessibilityLabel,
  accessibilityHint,
  style,
}) {
  const { iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  const interactive = Boolean(onPress || onLongPress);
  const Wrapper = interactive ? Pressable : View;
  const baseStyle = [styles.row, divider && styles.divider, disabled && styles.disabled];

  return (
    <Wrapper
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={interactive ? disabled : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={interactive ? { disabled } : undefined}
      style={
        interactive
          ? ({ pressed }) => [...baseStyle, pressed && styles.pressed, style]
          : [...baseStyle, style]
      }
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {typeof title === 'string' ? (
            <AppText variant="bodyLg" numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
          ) : (
            title
          )}
          {titleAccessory}
        </View>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing || trailingCaption ? (
        <View style={styles.trailing}>
          {trailingCaption ? (
            <AppText variant="caption" color="textMuted">
              {trailingCaption}
            </AppText>
          ) : null}
          {trailing}
        </View>
      ) : null}
      {value ? (
        <AppText variant="caption" color="textMuted">
          {value}
        </AppText>
      ) : null}
      {chevron ? <Icon icon={ChevronRight} size={iconSize.md} color="textSubtle" /> : null}
    </Wrapper>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth, opacity }) =>
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
    pressed: { backgroundColor: colors.surfaceMuted },
    disabled: { opacity: opacity.disabled },
    leading: { alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: spacing.xxs },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { flexShrink: 1 },
    trailing: { alignItems: 'flex-end', gap: spacing.xxs },
  });
