import { Redirect } from 'expo-router';

// Browsers get no camera scanner; the invite link can be pasted in the join screen instead.
export default function ScanInviteScreen() {
  return <Redirect href="/groups/join" />;
}
