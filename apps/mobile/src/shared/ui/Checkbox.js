import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { Icon } from './Icon';

export function Checkbox({ checked, onChange, accessibilityLabel, size = 22 }) {
  const { layout } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={layout.hitSlop}
      style={[styles.box, { width: size, height: size }, checked && styles.checked]}
    >
      {checked ? (
        <Icon icon={Check} size={size - 8} color="textOnPrimary" strokeWidth={2.5} />
      ) : null}
    </Pressable>
  );
}

const createStyles = ({ colors, borderWidth }) =>
  StyleSheet.create({
    box: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  });
