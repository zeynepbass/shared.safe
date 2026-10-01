import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '@/shared/theme';

export function Screen({
  header,
  footer,
  scroll = true,
  padded = true,
  keyboard = false,
  contentStyle,
  children,
}) {
  const styles = useThemedStyles(createStyles);
  const Body = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? {
        contentContainerStyle: [padded && styles.padded, styles.scrollContent, contentStyle],
        keyboardShouldPersistTaps: 'handled',
        style: styles.flex,
      }
    : { style: [styles.flex, padded && styles.padded, contentStyle] };

  const content = (
    <>
      {header}
      <Body {...bodyProps}>{children}</Body>
      {footer}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
      {footer ? null : <BottomInset />}
    </SafeAreaView>
  );
}

function BottomInset() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.bottom }} />;
}

export function BottomBar({ children, style }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }, style]}>
      {children}
    </View>
  );
}

const createStyles = ({ colors, layout, spacing, borderWidth }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    padded: { paddingHorizontal: layout.gutter },
    scrollContent: { paddingBottom: spacing.xxxl },
    bottomBar: {
      paddingHorizontal: layout.gutter,
      paddingTop: spacing.md,
      gap: spacing.md,
      backgroundColor: colors.bg,
      borderTopWidth: borderWidth.hairline,
      borderTopColor: colors.divider,
    },
  });
