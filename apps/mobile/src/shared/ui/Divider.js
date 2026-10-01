import { View } from 'react-native';

import { useTheme } from '@/shared/theme';

export function Divider({ inset = false, style }) {
  const { colors, layout, borderWidth } = useTheme();
  return (
    <View
      style={[
        { height: borderWidth.hairline, backgroundColor: colors.divider },
        inset && { marginHorizontal: layout.gutter },
        style,
      ]}
    />
  );
}
