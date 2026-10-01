import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export function BrandBar({ actions = [], trailing }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <View style={styles.square} />
        <AppText variant="overline" style={styles.brandText}>
          {t('common.appName')}
        </AppText>
      </View>
      <View style={styles.actions}>
        {trailing}
        {actions.map((action) => (
          <IconButton
            key={action.label}
            icon={action.icon}
            onPress={action.onPress}
            accessibilityLabel={action.label}
            size={20}
          />
        ))}
      </View>
    </View>
  );
}

const createStyles = ({ colors, layout, spacing, fontFamily }) =>
  StyleSheet.create({
    bar: {
      height: layout.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.gutter,
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    square: { width: 10, height: 10, backgroundColor: colors.primary },
    brandText: { color: colors.text, fontFamily: fontFamily.display, fontSize: 13 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  });
