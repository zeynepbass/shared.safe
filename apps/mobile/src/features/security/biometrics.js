import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const { AuthenticationType } = LocalAuthentication;

// What the device offers: { available, method } where method is 'faceId' | 'touchId' |
// 'face' | 'fingerprint' | 'biometric', for wording.
export async function biometricSupport() {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(AuthenticationType.FINGERPRINT);
    const ios = Platform.OS === 'ios';
    const method = face
      ? ios
        ? 'faceId'
        : 'face'
      : finger
        ? ios
          ? 'touchId'
          : 'fingerprint'
        : 'biometric';
    return { available: hardware && enrolled, method };
  } catch (error) {
    console.warn('Biometric support could not be checked', error?.message ?? error);
    return { available: false, method: 'biometric' };
  }
}

// Asks for Face ID / fingerprint, falling back to the device passcode. Resolves true on success.
export async function authenticate({ promptMessage, cancelLabel }) {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel });
    return result.success;
  } catch (error) {
    console.warn('Authentication failed to start', error?.message ?? error);
    return false;
  }
}
