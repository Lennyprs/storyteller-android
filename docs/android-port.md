# Android port status

The Android work is being added alongside the existing Electron application. The original renderer remains the source of UI, and Electron continues to use `electron.vite.config.mjs` and the existing `src/main` / `src/preload` services. Android builds the same renderer entry with `vite.config.mjs` and packages it through Capacitor.

## Completed foundation

- Created the `android-port` branch.
- Added Capacitor 8, its Android platform, SQLite, filesystem, and sharing plugins.
- Added a Vite build for the original React renderer and verified that it builds.
- Generated the native Android project and synchronized the SQLite, filesystem, and sharing plugins.
- Set Android API 33 as the minimum, locked the app to landscape, and restricted APK ABIs to `arm64-v8a`.
- Added an Actions workflow that builds and uploads a debug APK for the `android-port` branch.

## Not migrated or verified yet

The Android shell is not a complete Storyteller application. The current database handlers use synchronous `better-sqlite3` statements in Electron's main process, while Capacitor SQLite is asynchronous and runs through a native plugin. Those handlers still need an Android implementation and an API adapter for books, series, characters and relationships, worlds, locations, objects, chapters, scenes, and workspace layouts. The current preload APIs do not exist in the Android WebView.

Image storage, backup and restore, and the PDF, DOCX, and EPUB exporters also still depend on Electron file dialogs, Node file APIs, or Electron's print-to-PDF implementation. They need native file selection and writing, plus Android-compatible generators. Until those APIs are ported, the renderer build passing does not establish that the corresponding product features work on Android.

Tablet interaction and physical keyboard behavior have not been exercised on an Android tablet. Dockview and TipTap are present in the renderer bundle, but their Android interaction has not yet been validated.

## Verification performed

- `pnpm run build:web` — passed; built the original React renderer and included the original Book and Home screens.
- `pnpm exec cap sync android` — passed; synchronized the generated WebView assets and three Capacitor plugins.
- `gradlew.bat assembleDebug` — not run to completion because Java is not installed or available through `JAVA_HOME` / `PATH` in this environment. No APK has been produced or device-tested here.

The next implementation milestone is the asynchronous SQLite-backed Android API and a compatibility layer that keeps the renderer's existing domain API shape. Export and file workflows should follow before treating the Android app as functionally complete.
