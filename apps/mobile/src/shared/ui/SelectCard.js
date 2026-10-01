import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function SelectCard({ icon, title, subtitle, selected, onPress, style }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.card, selected && styles.selected, style]}
    >
      {selected ? (
        <View style={styles.check}>
          <Icon icon={Check} size={12} color="textOnPrimary" strokeWidth={2.5} />
        </View>
      ) : null}
      {icon ? <Icon icon={icon} size={20} color={selected ? 'primary' : 'text'} /> : null}
      <View style={styles.texts}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    card: {
      flex: 1,
      minHeight: 96,
      padding: spacing.md,
      justifyContent: 'space-between',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
    selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    check: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    texts: { gap: spacing.xxs },
  });
