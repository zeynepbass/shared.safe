import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { CornerMarks } from './CornerMarks';

export function Card({ corners = false, padded = true, tone = 'plain', style, children }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.card, padded && styles.padded, tone === 'surface' && styles.surface, style]}
    >
      {corners ? <CornerMarks /> : null}
      {children}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    card: { borderWidth: borderWidth.hairline, borderColor: colors.border },
    padded: { padding: spacing.lg },
    surface: { backgroundColor: colors.surface },
  });
