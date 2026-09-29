import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function ListRow({
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
  divider = true,
  accessibilityLabel,
  style,
}) {
  const styles = useThemedStyles(createStyles);
  const interactive = Boolean(onPress || onLongPress);
  const Wrapper = interactive ? Pressable : View;
  const baseStyle = [styles.row, divider && styles.divider];

  return (
    <Wrapper
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
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
      {chevron ? <Icon icon={ChevronRight} size={16} color="textSubtle" /> : null}
    </Wrapper>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
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
    leading: { alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: spacing.xxs },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { flexShrink: 1 },
    trailing: { alignItems: 'flex-end', gap: spacing.xxs },
  });
