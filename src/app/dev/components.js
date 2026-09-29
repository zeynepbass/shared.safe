import { Redirect } from 'expo-router';

import ComponentGallery from '@/features/dev/ComponentGallery';

export default function DevComponentsRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ComponentGallery />;
}
