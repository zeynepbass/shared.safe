import { Check } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function OptionSheet({ visible, title, options, value, onSelect, onClose, children }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={title} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {title ? (
          <AppText variant="overline" color="textMuted" style={styles.title}>
            {title}
          </AppText>
        ) : null}
        <ScrollView style={styles.list}>
          {options?.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                {option.leading}
                <AppText variant="bodyLg" style={styles.label}>
                  {option.label}
                </AppText>
                {selected ? <Icon icon={Check} size={18} color="primary" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {children}
      </View>
    </Modal>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth }) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: colors.bg,
      paddingTop: spacing.lg,
      borderTopWidth: borderWidth.hairline,
      borderTopColor: colors.border,
    },
    title: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
    list: { maxHeight: 420 },
    option: {
      minHeight: 52,
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
