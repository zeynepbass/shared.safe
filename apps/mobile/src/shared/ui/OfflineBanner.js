import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function OfflineBanner({ visible = true, pendingCount = 0, message, style }) {
  const { t } = useTranslation();
  const { iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);

  if (!visible) return null;

  const text =
    message ??
    (pendingCount > 0
      ? t('offlineBanner.pending', { count: pendingCount })
      : t('offlineBanner.message'));

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={[styles.banner, style]}
    >
      <Icon icon={WifiOff} size={iconSize.xs} color="textOnInverse" />
      <AppText variant="caption" color="textOnInverse" numberOfLines={1} style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    banner: {
      minHeight: layout.bannerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.xs,
      backgroundColor: colors.inverse,
    },
    text: { flexShrink: 1 },
  });
