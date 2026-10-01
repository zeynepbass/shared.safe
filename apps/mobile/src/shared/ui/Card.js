import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { CornerMarks } from './CornerMarks';

export function Card({
  corners = false,
  padded = true,
  tone = 'plain',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}) {
  const styles = useThemedStyles(createStyles);
  const baseStyle = [styles.card, padded && styles.padded, styles[tone]];
  const content = (
    <>
      {corners ? <CornerMarks /> : null}
      {children}
    </>
  );

  if (!onPress) {
    return <View style={[...baseStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [...baseStyle, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const createStyles = ({ colors, spacing, borderWidth, radius }) =>
  StyleSheet.create({
    card: {
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
      borderRadius: radius.card,
    },
    padded: { padding: spacing.lg },
    plain: {},
    surface: { backgroundColor: colors.surface },
    primary: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    pressed: { backgroundColor: colors.surfaceMuted },
  });
