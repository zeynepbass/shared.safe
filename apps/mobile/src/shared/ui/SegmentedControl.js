import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  style,
  accessibilityLabel,
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.group, size === 'sm' && styles.groupSm, disabled && styles.disabled, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const inactive = disabled || option.disabled;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={inactive}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected, disabled: inactive }}
            style={({ pressed }) => [
              styles.item,
              index > 0 && styles.itemDivider,
              selected && styles.itemSelected,
              pressed && !selected && styles.itemPressed,
              option.disabled && styles.disabled,
            ]}
          >
            <AppText
              variant={size === 'sm' ? 'caption' : 'body'}
              color={selected ? 'textOnPrimary' : 'text'}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = ({ colors, spacing, layout, borderWidth, radius, opacity }) =>
  StyleSheet.create({
    group: {
      flexDirection: 'row',
      height: layout.segmentHeight,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
      borderRadius: radius.control,
      overflow: 'hidden',
    },
    groupSm: { height: layout.segmentHeightSm },
    disabled: { opacity: opacity.disabled },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    itemDivider: { borderLeftWidth: borderWidth.hairline, borderLeftColor: colors.border },
    itemSelected: { backgroundColor: colors.primary },
    itemPressed: { backgroundColor: colors.surfaceMuted },
  });
