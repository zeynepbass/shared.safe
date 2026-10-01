import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme, useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

export function OptionSheet({ visible, title, options, value, onSelect, onClose, children }) {
  const { iconSize } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} footer={children}>
      {options?.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            {option.leading}
            <AppText variant="bodyLg" style={styles.label}>
              {option.label}
            </AppText>
            {selected ? <Icon icon={Check} size={iconSize.lg} color="primary" /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    option: {
      minHeight: layout.inputHeightLg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: layout.gutter,
      borderBottomWidth: borderWidth.hairline,
      borderBottomColor: colors.divider,
    },
    pressed: { backgroundColor: colors.surfaceMuted },
    label: { flex: 1 },
  });
