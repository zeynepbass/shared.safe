import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { scrub } from './scrub';

// Crash and performance reporting. It is off unless a DSN is configured (EXPO_PUBLIC_SENTRY_DSN),
// so development and tests never report anything.
//
// The app's promise is that nobody but the group can read its data, and that includes us.
// Reports therefore carry no user, no IP address, no screenshots, no taps (their labels are
// names and amounts) and no console output; whatever is left goes through scrub.

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const DROPPED_BREADCRUMBS = ['console', 'touch', 'ui.click', 'ui.input'];

// Expo Router's screens: time to first frame per route, and a breadcrumb per navigation.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: Constants.executionEnvironment !== 'storeClient',
});

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: Updates.channel || (__DEV__ ? 'development' : 'production'),
    // Which update is running, so a regression can be traced to the update that brought it.
    dist: Updates.updateId ?? undefined,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    tracesSampleRate: __DEV__ ? 1 : 0.2,
    integrations: [navigationIntegration],
    beforeBreadcrumb: (breadcrumb) =>
      DROPPED_BREADCRUMBS.includes(breadcrumb.category) ? null : scrub(breadcrumb),
    beforeSend: (event) => scrub(event),
    beforeSendTransaction: (event) => scrub(event),
  });
}

// Reports an error that was caught and handled (the user saw a message, nothing crashed).
export function reportError(error, context) {
  console.error(error);
  Sentry.captureException(error, context ? { tags: { context } } : undefined);
}

// Runs `fn` as a span of the current trace; just runs it when reporting is off.
export function traced(name, op, fn) {
  return Sentry.startSpan({ name, op }, fn);
}

export const wrapRoot = (Component) => (dsn ? Sentry.wrap(Component) : Component);
