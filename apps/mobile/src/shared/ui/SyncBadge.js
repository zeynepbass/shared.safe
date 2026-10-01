import { CloudAlert, CloudCheck, CloudOff, CloudUpload } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

const STATUSES = {
  synced: { icon: CloudCheck, fg: 'success', bg: 'successSoft' },
  pending: { icon: CloudUpload, fg: 'primary', bg: 'primarySoft' },
  offline: { icon: CloudOff, fg: 'textMuted', bg: 'surface' },
  error: { icon: CloudAlert, fg: 'danger', bg: 'dangerSoft' },
};

export function SyncBadge({ status = 'pending', showLabel = false, label, style }) {
  const { t } = useTranslation();
  const { colors, iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  const config = STATUSES[status];
  const text = label ?? t(`sync.${status}`);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        styles.badge,
        showLabel ? { backgroundColor: colors[config.bg] } : styles.iconOnly,
        style,
      ]}
    >
      <Icon icon={config.icon} size={iconSize.xs} color={config.fg} />
      {showLabel ? (
        <AppText variant="micro" color={config.fg} numberOfLines={1}>
          {text}
        </AppText>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth, radius }) =>
  StyleSheet.create({
    badge: {
      minHeight: layout.syncBadge,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: radius.badge,
      alignSelf: 'flex-start',
    },
    iconOnly: {
      width: layout.syncBadge,
      paddingHorizontal: spacing.none,
      paddingVertical: spacing.none,
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
  });
