import { CapacitorConfig } from '@capacitor/cli';

/**
 * TN Land Verify — Capacitor config
 *
 * The app is a WebView wrapper that loads your hosted Next.js frontend.
 * Change `server.url` to your production Vercel / custom domain URL.
 *
 * For a fully offline/bundled build (no internet needed):
 *   1. Run `npm run build && npm run export` in /frontend
 *   2. Copy `frontend/out/` into `mobile/www/`
 *   3. Remove the `server` block below
 */
const config: CapacitorConfig = {
  appId: 'in.tnlandverify.app',
  appName: 'TN Land Verify',
  webDir: 'www',

  // ── Live-URL mode (recommended for MVP) ──────────────────────────────
  // The app loads your hosted web app inside a WebView.
  // Replace with your actual deployed URL.
  server: {
    url: 'https://tn-land-verify.vercel.app',
    cleartext: false, // must be false for HTTPS
    androidScheme: 'https',
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true for dev debugging
    backgroundColor: '#1e3a5f',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1e3a5f',
      androidSplashResourceName: 'splash',
      showSpinner: true,
      spinnerColor: '#facc15',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1e3a5f',
    },
  },
};

export default config;
