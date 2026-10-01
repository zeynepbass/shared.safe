import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

const TONES = {
  primary: { bg: 'primarySoft', fg: 'primary' },
  neutral: { bg: 'surface', fg: 'textMuted' },
  success: { bg: 'successSoft', fg: 'success' },
  danger: { bg: 'dangerSoft', fg: 'danger' },
};

export function Badge({ label, tone = 'neutral' }) {
  const styles = useThemedStyles(createStyles);
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, styles[bg]]}>
      <AppText variant="caption" color={fg} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const createStyles = ({ colors, spacing }) =>
  StyleSheet.create({
    badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
    text: { fontSize: 11, lineHeight: 15 },
    primarySoft: { backgroundColor: colors.primarySoft },
    surface: { backgroundColor: colors.surface },
    successSoft: { backgroundColor: colors.successSoft },
    dangerSoft: { backgroundColor: colors.dangerSoft },
  });
