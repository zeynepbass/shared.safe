import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { BlueprintGrid } from './BlueprintGrid';
import { Icon } from './Icon';

export function EmptyState({ icon, title, description, children, style }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.wrapper, style]}>
      <BlueprintGrid cell={14} style={styles.grid}>
        <Icon icon={icon} size={28} color="primary" />
      </BlueprintGrid>
      <View style={styles.texts}>
        <AppText variant="heading" align="center" style={styles.title}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="body" color="textMuted" align="center">
            {description}
          </AppText>
        ) : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const createStyles = ({ spacing, layout }) =>
  StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      gap: spacing.xl,
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.xxxl,
    },
    grid: { width: 112, height: 112 },
    texts: { gap: spacing.sm, alignItems: 'center', maxWidth: 320 },
    title: { fontSize: 22, lineHeight: 26 },
    actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.sm },
  });
