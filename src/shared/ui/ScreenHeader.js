import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export function ScreenHeader({ title, subtitle, leading = 'back', onLeadingPress, actions = [] }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const leadingIcon = leading === 'close' ? X : leading === 'back' ? ChevronLeft : null;

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {leadingIcon ? (
          <IconButton
            icon={leadingIcon}
            onPress={onLeadingPress ?? (() => router.back())}
            accessibilityLabel={leading === 'close' ? t('common.close') : t('common.back')}
          />
        ) : null}
      </View>
      <View style={styles.center}>
        {title ? (
          <AppText variant="headerTitle" numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.side, styles.actions]}>
        {actions.map((action) => (
          <IconButton
            key={action.label}
            icon={action.icon}
            onPress={action.onPress}
            accessibilityLabel={action.label}
            color={action.color}
          />
        ))}
      </View>
    </View>
  );
}

const createStyles = ({ layout, spacing }) =>
  StyleSheet.create({
    header: {
      minHeight: layout.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.gutter - spacing.sm,
    },
    side: { width: 80, flexDirection: 'row', alignItems: 'center' },
    actions: { justifyContent: 'flex-end' },
    center: { flex: 1, alignItems: 'center' },
  });
