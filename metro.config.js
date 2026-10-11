// Learn more https://docs.expo.dev/guides/customizing-metro
// Everything below only matters for the web preview (`npm run web`): it sets up
// expo-sqlite's web build (https://docs.expo.dev/versions/latest/sdk/sqlite/#web-setup).
// Android and iOS bundles resolve and build exactly as without it.
const http = require('http');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The web build loads wa-sqlite from a .wasm file.
config.resolver.assetExts.push('wasm');

// expo-sqlite 57.0.4's web WorkerChannel truncates sync results over 255 bytes;
// use the patched copy in patches/ on web. Its own relative imports resolve
// against the original file.
const sqliteWebDir = path.join(path.dirname(require.resolve('expo-sqlite/package.json')), 'web');
const patchedWorkerChannel = path.join(__dirname, 'patches/expo-sqlite/web/WorkerChannel.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const from = context.originModulePath;
    if (moduleName === './WorkerChannel' && path.dirname(from) === sqliteWebDir) {
      return { type: 'sourceFile', filePath: patchedWorkerChannel };
    }
    if (from === patchedWorkerChannel) {
      const originModulePath = path.join(sqliteWebDir, 'WorkerChannel.ts');
      return context.resolveRequest({ ...context, originModulePath }, moduleName, platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

// The web build needs SharedArrayBuffer, so the page must be cross-origin
// isolated. The documented `server.enhanceMiddleware` only wraps Metro's own
// middleware, and Expo CLI serves the web HTML from middleware that runs
// before it, so set the headers on every dev server response instead. This
// file runs in the CLI process, never in the app.
const writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return writeHead.apply(this, args);
};

module.exports = config;
