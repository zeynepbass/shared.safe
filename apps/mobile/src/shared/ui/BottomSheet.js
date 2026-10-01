import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export function BottomSheet({
  visible,
  onClose,
  title,
  showClose = false,
  scroll = true,
  footer,
  children,
}) {
  const { t } = useTranslation();
  const { spacing, motion } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translate = useState(() => new Animated.Value(height))[0];

  useEffect(() => {
    if (!visible) {
      translate.setValue(height);
      return;
    }
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        translate.setValue(0);
        return;
      }
      Animated.timing(translate, {
        toValue: 0,
        duration: motion.base,
        useNativeDriver: true,
      }).start();
    });
  }, [visible, translate, height, motion.base]);

  const Body = scroll ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <View style={styles.handle} accessibilityElementsHidden />
          {title || showClose ? (
            <View style={styles.titleRow}>
              {title ? (
                <AppText
                  variant="overline"
                  color="textMuted"
                  accessibilityRole="header"
                  style={styles.title}
                >
                  {title}
                </AppText>
              ) : (
                <View style={styles.title} />
              )}
              {showClose ? (
                <IconButton icon={X} onPress={onClose} accessibilityLabel={t('common.close')} />
              ) : null}
            </View>
          ) : null}
          <Body style={styles.body} keyboardShouldPersistTaps={scroll ? 'handled' : undefined}>
            {children}
          </Body>
          {footer}
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth, radius }) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: {
      maxHeight: '90%',
      backgroundColor: colors.bg,
      paddingTop: spacing.sm,
      borderTopWidth: borderWidth.hairline,
      borderTopColor: colors.border,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
    },
    handle: {
      alignSelf: 'center',
      width: layout.sheetHandleWidth,
      height: layout.sheetHandleHeight,
      marginBottom: spacing.sm,
      backgroundColor: colors.borderStrong,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.iconButton,
      paddingLeft: layout.gutter,
      paddingRight: layout.gutter - spacing.sm,
      paddingBottom: spacing.xs,
    },
    title: { flex: 1 },
    body: { maxHeight: layout.sheetMaxHeight, flexGrow: 0 },
  });
