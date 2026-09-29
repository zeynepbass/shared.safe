import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function StatGrid({ rows, style }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.grid, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, rowIndex > 0 && styles.rowDivider]}>
          {row.map((cell, cellIndex) => (
            <StatCell key={cell.label} {...cell} divider={cellIndex > 0} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function StatCell({ label, value, children, onPress, divider, accessibilityLabel }) {
  const styles = useThemedStyles(createStyles);
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.cell, divider && styles.cellDivider]}
    >
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      {children ??
        (typeof value === 'string' ? <AppText variant="bodyStrong">{value}</AppText> : value)}
    </Wrapper>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    grid: { borderWidth: borderWidth.hairline, borderColor: colors.border },
    row: { flexDirection: 'row' },
    rowDivider: { borderTopWidth: borderWidth.hairline, borderTopColor: colors.border },
    cell: { flex: 1, padding: spacing.md, gap: spacing.xs },
    cellDivider: { borderLeftWidth: borderWidth.hairline, borderLeftColor: colors.border },
  });
