import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['decimal', '0', 'backspace'],
];

export function Keypad({ onKey, decimalSeparator = ',' }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);

  const press = (key) => {
    Haptics.selectionAsync().catch(() => {});
    onKey(key);
  };

  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={
                key === 'backspace'
                  ? t('keypad.backspace')
                  : key === 'decimal'
                    ? t('keypad.decimal')
                    : key
              }
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            >
              {key === 'backspace' ? (
                <Icon icon={Delete} size={22} />
              ) : (
                <AppText variant="keypad">{key === 'decimal' ? decimalSeparator : key}</AppText>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ colors }) =>
  StyleSheet.create({
    pad: { gap: 4 },
    row: { flexDirection: 'row' },
    key: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
    pressed: { backgroundColor: colors.surface },
  });
