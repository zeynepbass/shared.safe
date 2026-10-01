import { Camera } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { touchSlop, useThemedStyles } from '@/shared/theme';

import { Icon } from './Icon';

const RING = 40;

// `onPhotoPress` adds the dashed camera tile after the swatches; while a photo is in use
// (`photoSelected`) that tile carries the selection ring instead of a colour.
export function ColorPicker({
  colors,
  value,
  onChange,
  accessibilityLabel,
  onPhotoPress,
  photoSelected = false,
  photoLabel,
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {colors.map((color, index) => {
        const selected = !photoSelected && color === value;
        return (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${accessibilityLabel ?? ''} ${index + 1}`.trim()}
            hitSlop={touchSlop(RING)}
            style={[styles.ring, selected && styles.ringSelected]}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </Pressable>
        );
      })}
      {onPhotoPress ? (
        <Pressable
          onPress={onPhotoPress}
          accessibilityRole="button"
          accessibilityState={{ selected: photoSelected }}
          accessibilityLabel={photoLabel}
          hitSlop={touchSlop(RING)}
          style={[styles.ring, photoSelected && styles.ringSelected]}
        >
          <View style={styles.photo}>
            <Icon icon={Camera} size={16} color={photoSelected ? 'primary' : 'textMuted'} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors, spacing, borderWidth }) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
    ring: {
      width: RING,
      height: RING,
      padding: 3,
      borderWidth: borderWidth.thick,
      borderColor: 'transparent',
    },
    ringSelected: { borderColor: colors.text },
    swatch: { flex: 1 },
    photo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
    },
  });
