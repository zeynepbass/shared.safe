import { Redirect, useLocalSearchParams } from 'expo-router';

// Opening an invite link (ortakkasa://join?g=…&k=…) lands here and continues in the join screen.
export default function JoinLink() {
  const { g, k } = useLocalSearchParams();
  return (
    <Redirect
      href={{ pathname: '/groups/join', params: { invite: `ortakkasa://join?g=${g}&k=${k}` } }}
    />
  );
}
