// Adds what depends on the build to app.json: which variant is being built (set by the EAS
// profile through APP_VARIANT), where updates come from and where crash reports go.
//
// The development variant has its own name and id, so it installs next to the real app. Preview
// and production share an id: a preview build is the production app before it is released.
const VARIANTS = {
  development: { name: 'Ortak Kasa (Dev)', idSuffix: '.dev' },
  preview: { name: 'Ortak Kasa (Önizleme)', idSuffix: '' },
  production: { name: 'Ortak Kasa', idSuffix: '' },
};

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT] ?? VARIANTS.production;
  // Written into app.json by `eas init`.
  const projectId = config.extra?.eas?.projectId;

  return {
    ...config,
    name: variant.name,
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}${variant.idSuffix}`,
    },
    android: {
      ...config.android,
      package: `${config.android.package}${variant.idSuffix}`,
    },
    updates: {
      ...config.updates,
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : { enabled: false }),
    },
    plugins: [
      ...config.plugins,
      [
        '@sentry/react-native/expo',
        {
          // Source maps are uploaded during EAS builds when SENTRY_AUTH_TOKEN is set there.
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
    ],
  };
};
