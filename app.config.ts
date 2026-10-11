import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the real app's config, and release builds use it unchanged.
// APP_VARIANT=preview gives a separate app (own package, name and scheme) for
// trying branches on the phone next to the real app, without touching its data.
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const variant = process.env.APP_VARIANT;
  if (!variant) return base;
  if (variant !== 'preview') {
    throw new Error(`Unknown APP_VARIANT "${variant}" (expected "preview" or unset)`);
  }

  return {
    ...base,
    name: 'Spendlog Preview',
    scheme: 'spendlog-preview',
    ios: { ...base.ios, bundleIdentifier: 'com.spendlog.app.preview' },
    android: { ...base.android, package: 'com.spendlog.app.preview' },
  };
};
