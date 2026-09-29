import { Stack } from 'expo-router';

import { useTheme } from '@/shared/theme';

export default function AddExpenseLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
