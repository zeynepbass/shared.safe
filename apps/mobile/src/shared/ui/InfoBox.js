import { Info } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function InfoBox({ icon = Info, children, style }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.box, style]}>
      <Icon icon={icon} size={16} color="primary" style={styles.icon} />
      <AppText variant="caption" style={styles.text}>
        {children}
      </AppText>
    </View>
  );
}

const createStyles = ({ colors, spacing }) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.primarySoft,
    },
    icon: { marginTop: 1 },
    text: { flex: 1 },
  });
