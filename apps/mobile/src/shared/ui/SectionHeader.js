import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function SectionHeader({ title, variant = 'label', trailing, style }) {
  const styles = useThemedStyles(createStyles);
  const isOverline = variant === 'overline';
  return (
    <View style={[styles.row, isOverline && styles.overlineRow, style]}>
      <AppText
        variant={isOverline ? 'overline' : 'caption'}
        color={isOverline ? 'text' : 'textMuted'}
        accessibilityRole="header"
      >
        {title}
      </AppText>
      {typeof trailing === 'string' ? (
        <AppText variant="caption" color="textMuted">
          {trailing}
        </AppText>
      ) : (
        trailing
      )}
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    overlineRow: {
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.surfaceMuted,
      borderTopWidth: borderWidth.hairline,
      borderBottomWidth: borderWidth.hairline,
      borderColor: colors.divider,
    },
  });
