# NETFLY mobile (Flutter)

The NETFLY viewer app for Android and iOS. It looks and behaves like the web viewer app at phone
width (see [DESIGN.md](DESIGN.md)) and talks to the same API. Decisions 62–66 in
[docs/DECISIONS.md](../../docs/DECISIONS.md) cover auth tokens, the player, loaders, autoplay and
payments.

## Setup

- Flutter stable 3.47.8 (Dart 3), JDK 17 or newer, Android SDK (platform 36 is installed by Gradle
  on first build).
- `flutter pub get`

Configuration is one build-time value; everything else (branding colours and font, feature flags,
player settings, payment switches) comes from `GET /api/public/config` at runtime, like the web.

| `--dart-define` | Default | What |
|---|---|---|
| `NETFLY_API_URL` | `https://netflyapi.schoolsoft.online` | API origin (production; `http://10.0.2.2:8000` is the local stack from the Android emulator) |
| `NETFLY_WEB_URL` | `https://netflyclient.schoolsoft.online` | Public site, for share links |

App Links host (Android): `-Pnetfly.host=<your-domain>` on the Gradle command line, or
`netfly.host=<your-domain>` in `android/gradle.properties` (default `netfly.example`).

## Running against the local stack

Start the stack (`docker compose up -d`, seeded with `seed_demo`), then:

```sh
adb reverse tcp:8000 tcp:8000   # the API
adb reverse tcp:5005 tcp:5005   # local S3 (presigned image and video URLs point at localhost:5005)
flutter run --dart-define=NETFLY_API_URL=http://localhost:8000
```

Debug and profile builds allow plain HTTP (for the local stack only); release builds are HTTPS-only.

## Code generation

- **API client** (`lib/api/generated`, from `packages/api-client/openapi.json`): `pnpm api:generate`
  at the repository root regenerates the TypeScript and the Dart clients (`tool/generate_api.sh`;
  it skips the Dart client on machines without Flutter). CI fails when it's out of date.
- **Brand geometry** (`lib/brand/geometry.brand.dart`, from `packages/ui/src/logo-geometry.json` and the
  web's wordmark SVG): `dart run tool/sync_brand.dart`. A unit test fails when it drifts.
- **Launcher icons and native splash** (from `assets/brand/app-icon-512.png`, the web's maskable
  icon): `dart run flutter_launcher_icons` and `dart run flutter_native_splash:create`.

## Tests

```sh
flutter analyze                                  # zero issues, including infos
dart format --set-exit-if-changed lib test integration_test test_driver tool
flutter test                                     # unit, widget and golden tests
```

Golden tests (`test/golden_test.dart`) snapshot the account screens at 390 × 844 in the brand
font; they are compared by eye with `design-reference/` (the web renders differently pixel for
pixel). Refresh them with `flutter test --update-goldens test/golden_test.dart`.

`integration_test/app_test.dart` is the viewer journey on a device against a running stack: sign
in → home (frame timings while scrolling) → New & Hot → search → title → My List add/remove → play
10 s → progress saved on the server → Account → Playback (the mobile-data warning) → Membership →
sign out. It saves screenshots to `screenshots/android/` and timings to
`build/integration_response_data.json`.

```sh
ANDROID_HOME=… AVD=<avd name> sh tool/run_integration.sh
```

It creates a fresh viewer through the API, builds the profile APK, boots the emulator, sets up the
`adb reverse` ports, runs `flutter drive` and shuts the emulator down. (On a 16 GB machine Gradle and
the emulator don't fit in memory together, which is why it builds first.)

**Design reference.** `design-reference/<device>/` holds screenshots of the web app at 390 × 844 and
412 × 915, the specification for the app. Refresh them with the stack running:

```sh
cd e2e && node ../apps/mobile/tool/design_reference.mjs
```

## Release builds

Create an upload key once and keep it out of the repository:

```sh
keytool -genkey -v -keystore ~/netfly-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

`android/key.properties` (git-ignored):

```properties
storeFile=/home/you/netfly-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

Then:

```sh
flutter build appbundle --release --dart-define=NETFLY_API_URL=https://<api> -Pnetfly.host=<site>
flutter build apk --release --dart-define=NETFLY_API_URL=https://<api> -Pnetfly.host=<site>
```

Without `key.properties` the release build is signed with the debug key: fine for testing, not
accepted by Play.

**App Links.** For `https://<site>/title/<slug>` to open the app without a chooser, set Studio →
Settings → Mobile app → *Android signing certificate SHA-256* (Play Console → App integrity); the
site then serves `/.well-known/assetlinks.json`. `netfly://title/<slug>` works without it.

### iOS

iOS builds need macOS with Xcode, which this repository's development environment doesn't have,
so the iOS app has not been built or run yet. On a Mac:

1. `flutter build ios --release --dart-define=NETFLY_API_URL=https://<api>`, then archive in Xcode
   (`ios/Runner.xcworkspace`) with your team and bundle id.
2. Universal Links: add the Associated Domains capability (`applinks:<site>`) and set Studio →
   Settings → Mobile app → *iOS app IDs* (`TEAMID.bundle.id`); the site then serves
   `/.well-known/apple-app-site-association`.
3. Picture-in-Picture on iOS needs an `AVPictureInPictureController` on the native player view,
   which `video_player` doesn't expose: PiP is Android-only for now (decision 63).
4. Background audio mode is not enabled (playback pauses when the app leaves the foreground, as on
   Android unless PiP is active).

## Store listing notes

- **Payments.** The app sells plans with mobile money inside the app (decision 66). Apple and Google
  generally require their own in-app purchase for digital subscriptions; if review objects, switch
  off `payments.mobile_checkout_ios` / `payments.mobile_checkout_android` in Studio → Settings →
  Payments. The app then only signs members in and says plans are managed on the website.
- **Push notifications** are not wired: the backend has no device-token model yet. "Remind me" works
  in the app's notification bell (the same feed as the web). TODO: add a device-token endpoint and
  FCM/APNs delivery, then register the token after sign-in.
- Content rating, privacy policy and terms: the site's `/legal/*` pages.
