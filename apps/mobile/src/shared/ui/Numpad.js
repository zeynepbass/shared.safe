import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['decimal', '0', 'backspace'],
];

export function Numpad({ onKey, onClear, decimalSeparator, disabled = false, style }) {
  const { t, i18n } = useTranslation();
  const { iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  const separator = decimalSeparator ?? (i18n.language === 'tr' ? ',' : '.');

  const press = (key) => {
    Haptics.selectionAsync().catch(() => {});
    onKey(key);
  };

  const labelFor = (key) => {
    if (key === 'backspace') return t('keypad.backspace');
    if (key === 'decimal') return t('keypad.decimal');
    return key;
  };

  return (
    <View style={[styles.pad, disabled && styles.disabled, style]}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => press(key)}
              onLongPress={key === 'backspace' && onClear ? onClear : undefined}
              disabled={disabled}
              accessibilityRole="keyboardkey"
              accessibilityLabel={labelFor(key)}
              accessibilityHint={key === 'backspace' && onClear ? t('keypad.clearHint') : undefined}
              accessibilityState={{ disabled }}
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            >
              {key === 'backspace' ? (
                <Icon icon={Delete} size={iconSize.xxl} />
              ) : (
                <AppText variant="keypad">{key === 'decimal' ? separator : key}</AppText>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, opacity }) =>
  StyleSheet.create({
    pad: { gap: spacing.xs },
    disabled: { opacity: opacity.disabled },
    row: { flexDirection: 'row' },
    key: {
      flex: 1,
      height: layout.numpadKey,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { backgroundColor: colors.surface },
  });
