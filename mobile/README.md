# TN Land Verify — Android App

A Capacitor WebView wrapper that packages the TN Land Verify web app as a native Android APK.

## How it works

The APK embeds a WebView that loads your hosted Next.js frontend URL.  
All features (search, automation, WebSocket updates, CAPTCHA modal) work exactly as in the browser.

---

## Get the APK (GitHub Actions — easiest)

1. Push to `main` (or go to **Actions → Build Android APK → Run workflow**)
2. Wait ~10 minutes for the build to complete
3. Download `TN-Land-Verify-APK` from the **Artifacts** section
4. Install on your Android device:
   ```
   Settings → Security → Install unknown apps → Allow
   ```

---

## Build locally (requires Android Studio)

```bash
# Prerequisites: Node.js 20, JDK 17, Android Studio + SDK 34

cd mobile
npm install

# Add Android platform (first time only)
npx cap add android

# Point to your hosted frontend URL — edit capacitor.config.ts
# server.url = 'https://your-vercel-app.vercel.app'

# Sync
npx cap sync android

# Build debug APK
cd android
./gradlew assembleDebug

# APK is at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

Open in Android Studio:
```bash
npx cap open android
```

---

## Release (signed) APK — for Google Play

1. Generate a keystore:
   ```bash
   keytool -genkey -v -keystore release.keystore \
     -alias tnlandverify -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add these GitHub repository secrets:
   - `ANDROID_KEYSTORE_BASE64` — `base64 release.keystore`
   - `ANDROID_KEY_ALIAS` — `tnlandverify`
   - `ANDROID_KEY_PASSWORD` — your key password
   - `ANDROID_STORE_PASSWORD` — your store password
3. Run the workflow with **release_type = release**

---

## Change the web app URL

Edit `capacitor.config.ts`:

```ts
server: {
  url: 'https://your-domain.com',   // ← your Vercel / custom domain
}
```

Then re-sync and rebuild:
```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## App details

| Field | Value |
|-------|-------|
| Package ID | `in.tnlandverify.app` |
| Min SDK | Android 7.0 (API 24) |
| Target SDK | Android 14 (API 34) |
| Architecture | arm64-v8a, armeabi-v7a, x86_64 |
