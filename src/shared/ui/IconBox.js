import { StyleSheet, View } from 'react-native';

import { useThemedStyles } from '@/shared/theme';

import { Icon } from './Icon';

export function IconBox({ icon, size = 36, iconSize = 18, color = 'primary', style }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.box, { width: size, height: size }, style]}>
      <Icon icon={icon} size={iconSize} color={color} />
    </View>
  );
}

const createStyles = ({ colors, borderWidth }) =>
  StyleSheet.create({
    box: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: borderWidth.hairline,
      borderColor: colors.border,
    },
  });
