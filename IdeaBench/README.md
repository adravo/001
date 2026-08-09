# Idea Bench

A native Android app (Kotlin + Jetpack Compose) that turns your scattered notes and
screenshots into one searchable, categorized idea bank, using the Anthropic API to
summarize, tag, and suggest a next step for each one.

- **Target:** Android 10+ (minSdk 29), compileSdk/targetSdk 34
- **Storage:** Room (on-device, nothing leaves your phone except the note/screenshot text sent to the Anthropic API for analysis)
- **Networking:** Retrofit + kotlinx.serialization, calling `https://api.anthropic.com/v1/messages` directly
- **UI:** Jetpack Compose, Material 3, single-Activity + Navigation-Compose

## Features

- **Notes analyzer** — import a whole notes-export folder (SAF), share text straight from
  your phone's Notes app, or paste text in. Handles one-file-per-note exports, a single
  combined export (auto-detects the separator and shows a preview before importing),
  `.html` exports, and Google Keep Takeout `.json`. Duplicates are skipped by content hash.
- **Screenshot analyzer** — scans your gallery's Screenshots folder via MediaStore, sends
  each new screenshot to the API for text/info extraction + categorization, and saves a
  local thumbnail. Processes sequentially with a progress bar; one failed image never stops
  the batch.
- **Resumable batch analysis** — notes are analyzed in batches of ~15–20. If you close the
  app or a batch fails to parse, just tap **Resume** — it picks up exactly where it left off
  because progress is written to the database after every batch, not held in memory.
- **Browse / Focus / Add** — a searchable, filterable list of everything; a one-item-at-a-time
  "Focus" mode with Previous / Next / "Done, next"; and an Add screen for all three intake
  paths plus optional daily WorkManager re-scans.
- **Your API key never leaves the device** except in the direct HTTPS request to Anthropic —
  it's stored in `EncryptedSharedPreferences`.

## Project structure

```
IdeaBench/
├── app/
│   └── src/main/java/com/ideabench/app/
│       ├── data/
│       │   ├── local/        Room entity, DAO, database, type converters
│       │   ├── remote/       Anthropic API client (Retrofit + kotlinx.serialization)
│       │   ├── repository/   Single source of truth over the DAO
│       │   ├── importer/     Folder scan, note splitting, HTML/Keep parsing, share intent
│       │   ├── screenshot/   MediaStore scan, downscale/compress/base64
│       │   ├── analysis/     Batch note analysis + per-screenshot analysis, JSON parsing
│       │   └── prefs/        Encrypted API key storage + plain app settings
│       ├── work/              WorkManager daily re-scan jobs
│       └── ui/                 Compose screens + ViewModels (browse, focus, add, detail, settings)
├── build.gradle.kts / settings.gradle.kts / gradle/
└── README.md
```

There's no Hilt/Dagger — `Container` in `IdeaBenchApp.kt` is a small hand-rolled DI graph,
which is plenty for an app this size and keeps the build simple.

## Building it

### 1. Open in Android Studio

1. Install a recent **Android Studio** (Koala/2024.1 or newer recommended — it ships a
   Kotlin/AGP toolchain compatible with this project: AGP 8.6.1, Kotlin 2.0.21).
2. `File → Open…` and select the `IdeaBench/` folder (the one with `settings.gradle.kts`).
3. Let Gradle sync. It will download the Android Gradle Plugin, Kotlin, and all
   dependencies (Room, WorkManager, Compose, Retrofit, Coil, etc.) from Google's and Maven
   Central's repositories the first time — this needs an internet connection.

### 2. Add your Anthropic API key

You don't need to hardcode anything to build — the key is entered **in the app** (Settings
tab) at runtime and stored encrypted in `EncryptedSharedPreferences`. Get a key at
[console.anthropic.com](https://console.anthropic.com), install the debug build, open
**Settings**, paste it in, and tap **Save**.

(If you'd rather not type a long key on your phone: adb install the debug build, open
Settings, and paste from your clipboard — or use `adb shell input text` for testing.)

### 3. Build a debug APK

From Android Studio: **Build → Build APK(s)**, or from the command line:

```bash
cd IdeaBench
./gradlew assembleDebug
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Sideload it:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 4. First run

The app opens to an empty **Browse** tab with a hint to head to **Add**. From there:

- **Import notes from a folder** — pick your notes app's export folder. The app scans it,
  auto-detects the format(s) present, and (for anything that looks like one big combined
  export) shows you a preview of the first few notes it would split out before you confirm.
- **Analyze notes** — once notes are imported, tap **Analyze notes** to send them to Claude
  in batches. A progress bar tracks `done / total`; if it's interrupted, the button becomes
  **Resume analysis**.
- **Scan gallery for screenshots** — finds screenshots MediaStore knows about, then
  **Process N screenshots** downscales/compresses/sends each one and saves a thumbnail.
- **Paste or type a note** — quick fallback; blank lines or a lone `---` line split pasted
  text into multiple notes.
- You can also **share** text or a `.txt`/`.md` file into Idea Bench from your phone's Notes
  app (or anywhere with a Share sheet) — it's saved immediately and picked up by the next
  analysis run.

## Notes on model/config

- The model id used for both notes and screenshots is `claude-sonnet-4-6`
  (`AnthropicClient.DEFAULT_MODEL`) — change it in `data/remote/AnthropicClient.kt` if you
  want a different one.
- Requests retry with exponential backoff on HTTP 429 and 5xx; a 401 surfaces immediately as
  "invalid API key" rather than retrying.
- The model is asked to return **strict JSON only**; responses are parsed defensively
  (markdown-fence stripping, best-effort brace extraction) and a batch/image that still
  fails to parse is left unanalyzed rather than silently marked done, so it's retried on the
  next run instead of being lost.
- Categories are capped at roughly 10 across the whole collection — every prompt includes
  the categories already in your DB and asks the model to reuse one when it reasonably fits.

## Verifying this build

This project was generated and reviewed in a sandboxed environment without access to
Google's Maven repository (`dl.google.com`), so the Android Gradle Plugin and Android SDK
could not be downloaded to run a real `./gradlew assembleDebug` here. The Gradle wrapper,
`settings.gradle.kts`, and both `build.gradle.kts` files were validated with a local Gradle
install (dependency/plugin coordinates, DSL syntax), every Kotlin file was checked for
balanced braces/parens and consistent imports/signatures across modules, and every XML
resource was parsed to confirm well-formedness — but a full compile has not been run. Please
run a Gradle sync in Android Studio (or `./gradlew assembleDebug`) as your first step and
open an issue/ping if anything doesn't compile.

## Permissions used

| Permission | Why |
|---|---|
| `INTERNET` | Calling the Anthropic API |
| `READ_MEDIA_IMAGES` (13+) / `READ_EXTERNAL_STORAGE` (≤12) | Scanning the gallery for screenshots |
| SAF folder access (no manifest permission — a persisted URI grant) | Reading your notes export folder |

No location, contacts, microphone, or camera permissions are requested.
