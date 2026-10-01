import { Undo2 } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

const SnackbarContext = createContext(null);

export function SnackbarProvider({ children }) {
  const { t } = useTranslation();
  const { motion } = useTheme();
  const [snackbar, setSnackbar] = useState(null);
  const timer = useRef(null);
  const current = useRef(0);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setSnackbar(null);
  }, []);

  const show = useCallback(
    async ({ message, actionLabel, onAction, actionIcon, onUndo, duration }) => {
      clearTimeout(timer.current);
      const action = onUndo
        ? { label: t('common.undo'), onPress: onUndo, icon: Undo2 }
        : actionLabel
          ? { label: actionLabel, onPress: onAction, icon: actionIcon }
          : null;
      const id = current.current + 1;
      current.current = id;
      setSnackbar({ id, message, action });
      AccessibilityInfo.announceForAccessibility(
        action ? `${message}. ${t('snackbar.actionAvailable', { action: action.label })}` : message,
      );
      const screenReader = await AccessibilityInfo.isScreenReaderEnabled().catch(() => false);
      if (current.current !== id) return;
      const fallback = screenReader ? motion.snackbarScreenReader : motion.snackbar;
      timer.current = setTimeout(hide, duration ?? fallback);
    },
    [hide, t, motion.snackbar, motion.snackbarScreenReader],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <SnackbarContext.Provider value={{ show, hide }}>
      <View style={styles.flex}>
        {children}
        {snackbar ? (
          <FloatingSnackbar
            key={snackbar.id}
            message={snackbar.message}
            action={snackbar.action}
            onDismiss={hide}
          />
        ) : null}
      </View>
    </SnackbarContext.Provider>
  );
}

function FloatingSnackbar({ message, action, onDismiss }) {
  const { layout, spacing, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const translate = useState(() => new Animated.Value(spacing.xxl))[0];

  useEffect(() => {
    Animated.timing(translate, {
      toValue: 0,
      duration: motion.base,
      useNativeDriver: true,
    }).start();
  }, [translate, motion.base]);

  return (
    <Animated.View
      style={[
        styles.floating,
        {
          left: layout.gutter,
          right: layout.gutter,
          bottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      <Snackbar
        message={message}
        actionLabel={action?.label}
        actionIcon={action?.icon}
        onAction={
          action
            ? () => {
                action.onPress?.();
                onDismiss();
              }
            : undefined
        }
      />
    </Animated.View>
  );
}

export function Snackbar({ message, actionLabel, actionIcon, onAction, style }) {
  const { iconSize, layout } = useTheme();
  const themed = useThemedStyles(createStyles);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[themed.snackbar, style]}
    >
      <AppText variant="body" color="textOnInverse" style={styles.flex}>
        {message}
      </AppText>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={layout.hitSlop}
          style={({ pressed }) => [themed.action, pressed && themed.pressed]}
        >
          {actionIcon ? (
            <Icon icon={actionIcon} size={iconSize.sm} color="primaryOnInverse" />
          ) : null}
          <AppText variant="overline" color="primaryOnInverse">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used inside SnackbarProvider');
  return ctx;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  floating: { position: 'absolute' },
});

const createStyles = ({ colors, spacing, layout, radius, opacity }) =>
  StyleSheet.create({
    snackbar: {
      minHeight: layout.snackbarHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.inverse,
      borderRadius: radius.control,
    },
    action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    pressed: { opacity: opacity.pressedSubtle },
  });
