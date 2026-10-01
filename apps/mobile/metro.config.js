const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Expo's default config, plus the debug ids Sentry needs to match a crash to its source map.
const config = getSentryExpoConfig(__dirname);

config.resolver.sourceExts.push('sql');

module.exports = config;
