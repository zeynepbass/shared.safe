import { router } from 'expo-router';
import { useEffect } from 'react';

// Browsers get no receipt scanner; a photo can still be attached from the expense form.
export default function ScanReceiptScreen() {
  useEffect(() => {
    router.back();
  }, []);
  return null;
}
