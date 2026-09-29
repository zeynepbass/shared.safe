import { Pressable, StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { AppText } from './AppText';

export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  style,
  accessibilityLabel,
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[styles.group, size === 'sm' && styles.groupSm, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.item, index > 0 && styles.itemDivider, selected && styles.itemSelected]}
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

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    group: {
      flexDirection: 'row',
      height: 44,
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
    groupSm: { height: 32 },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    itemDivider: { borderLeftWidth: borderWidth.hairline, borderLeftColor: colors.border },
    itemSelected: { backgroundColor: colors.primary },
  });
