import { StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { BlueprintGrid } from './BlueprintGrid';
import { Icon } from './Icon';

export function EmptyState({ icon, title, description, children, style }) {
  const { iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.wrapper, style]}>
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BlueprintGrid cell={14} style={styles.grid}>
            <Icon icon={icon} size={iconSize.figure} color="primary" />
          </BlueprintGrid>
        </View>
      ) : null}
      <View style={styles.texts}>
        <AppText variant="subheading" align="center" accessibilityRole="header">
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
    grid: { width: layout.emptyFigure, height: layout.emptyFigure },
    texts: { gap: spacing.sm, alignItems: 'center', maxWidth: layout.readableWidth },
    actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.sm },
  });
