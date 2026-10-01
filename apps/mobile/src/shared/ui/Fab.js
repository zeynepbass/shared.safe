import { Plus } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/shared/theme';

import { Button } from './Button';

export function Fab({ title, onPress, icon = Plus, accessibilityLabel }) {
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Button
      title={title}
      icon={icon}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      corners
      fullWidth={false}
      style={[
        styles.fab,
        { right: layout.gutter, bottom: Math.max(insets.bottom, spacing.lg) + spacing.sm },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', minWidth: 132 },
});
