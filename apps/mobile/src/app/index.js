import { Redirect } from 'expo-router';

import { useSettings } from '@/features/settings/SettingsProvider';

export default function Index() {
  const { hasProfile, recoveryConfirmed } = useSettings();
  if (!hasProfile) return <Redirect href="/onboarding" />;
  return <Redirect href={recoveryConfirmed ? '/groups' : '/onboarding/recovery'} />;
}
