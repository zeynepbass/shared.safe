import { Redirect } from 'expo-router';

import { useSettings } from '@/features/settings/SettingsProvider';

export default function Index() {
  const { hasProfile } = useSettings();
  return <Redirect href={hasProfile ? '/groups' : '/onboarding'} />;
}
