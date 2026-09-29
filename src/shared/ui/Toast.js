import { Undo2 } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback(
    ({ message, actionLabel, onAction, duration = 5000 }) => {
      clearTimeout(timer.current);
      setToast({ id: Date.now(), message, actionLabel, onAction });
      AccessibilityInfo.announceForAccessibility(message);
      timer.current = setTimeout(hide, duration);
    },
    [hide],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      <View style={styles.flex}>
        {children}
        {toast ? <ToastView key={toast.id} toast={toast} onDismiss={hide} /> : null}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }) {
  const themed = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const translate = useState(() => new Animated.Value(24))[0];

  useEffect(() => {
    Animated.timing(translate, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }, [translate]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        themed.toast,
        { bottom: Math.max(insets.bottom, 16) + 8, transform: [{ translateY: translate }] },
      ]}
    >
      <AppText variant="body" color="textOnToast" style={styles.flex}>
        {toast.message}
      </AppText>
      {toast.actionLabel ? (
        <Pressable
          onPress={() => {
            toast.onAction?.();
            onDismiss();
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={themed.action}
        >
          <Icon icon={Undo2} size={14} color="primary" />
          <AppText variant="overline" color="primary">
            {toast.actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });

const createStyles = ({ colors, spacing, layout }) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      left: layout.gutter,
      right: layout.gutter,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.toast,
    },
    action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  });
