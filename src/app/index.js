import { Redirect } from 'expo-router';

import { useSettings } from '@/features/settings/SettingsProvider';

export default function Index() {
  const { onboarded } = useSettings();
  return <Redirect href={onboarded ? '/groups' : '/onboarding'} />;
}
