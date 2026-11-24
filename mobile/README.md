# Claymores RFC · Flutter starter

A club app for players, friends, and family. Home shows the next match and practice details. Fixtures shows the upcoming schedule and a season-filtered history. Standings shows the league table and playoffs from the club API. Club contains the player preview, notification settings and (when configured) Google sign-in, which leads to a profile with dues and card payments.

## Run it

Verified with Flutter 3.50.1 and Dart 3.14.0. Open this folder in an editor with the Flutter and Dart extensions, or run these commands from this folder with Flutter on your PATH.

```sh
flutter pub get
flutter run -d chrome
```

The browser preview uses a labeled November 23, 2026 Sanity snapshot. Native builds fetch the published Sanity feed and fall back to the snapshot when the feed is unavailable. To use live Sanity in a browser deployment, allow its exact origin in Sanity and build with `--dart-define=SANITY_WEB_LIVE=true`.

To try availability, open **Club**, turn on **Player preview**, return to **Home**, and tap a response on the fixture. Responses are saved by fixture ID on this device and are also shown for that fixture on the Fixtures tab. Preview mode resets when you restart the app. It is a UI demo for the eventual signed-in player experience.

Dues are off by default (`--dart-define=ENABLE_DUES=true`). Without sign-in, turning on Player preview shows a placeholder. With sign-in, the profile lists your dues and lets you pay by card (below).

## Code layout

```
lib/
  main.dart                 runApp + platform deep links
  app/                      app.dart (MaterialApp.router, services), router.dart (go_router),
                            theme.dart (all colours and button styles), config.dart (dart-defines),
                            deep_links.dart, services.dart (AppScope + shared notifiers)
  data/                     api_base/api_client (JSON + bearer + 401 retry), auth_api,
                            club/standings/member repositories, models/
  features/
    home/ fixtures/ standings/ club/ auth/ profile/
  shared/widgets.dart       SectionHeading, Panel, Eyebrow, StatusPanel, DirectionsButton
```

Routing uses go_router: a `StatefulShellRoute` keeps each tab's state (`/home`, `/fixtures`, `/standings`, `/club`); match details (`/match/:id`), the profile (`/club/profile`) and dues (`/club/profile/dues/:id`) open above the tabs with a back button. State is plain `ChangeNotifier`/`ValueNotifier` handed down by an `InheritedWidget` (`AppScope`): there are only a few shared values (schedule, preview switch, session), so a state-management package would add more than it saves.

The UI imports `package:material_ui/material_ui.dart`. That is the official Material library decoupled from the SDK; in Flutter 3.50 `package:flutter/material.dart` is deprecated in its favour, and go_router uses it too, so keep it.

## Learn Flutter from this project

1. Open `lib/app/app.dart` and find `ClaymoresApp`. `MaterialApp.router` takes the theme from `lib/app/theme.dart` and the routes from `lib/app/router.dart`. Change the practice heading in `lib/features/home/home_page.dart` and hot reload.
2. `ClubShell` in `router.dart` draws the app bar and the four tabs. `ClubDataView` renders loading, error or content for the shared schedule (`ClubDataController`).
3. `FixtureCard` and `AvailabilityPicker` live in `lib/features/fixtures/`. The picker saves through `AvailabilityStore`, which uses `SharedPreferencesAsync` and notifies every tab.
4. Follow `ClubRepository.load` in `lib/data/club_repository.dart`. The GROQ query in `assets/club.groq` projects Sanity fields into a small public payload. Match dates use Orlando's calendar day.
5. `lib/features/club/notifications.dart` asks permission and subscribes to separate public match and practice topics.

## Styling

`lib/app/theme.dart` is the only place colours and button styles are defined, following repo-root `STYLING.md`: white background, `#111111` text, `#555555` secondary text (set in the `textTheme`, e.g. `bodySmall`), `#EAEAEA` dividers, pink `#fd80b5` for eyebrows, links (`TextButton`) and the accent bar under section headings, steel blue `#77c3ef` for every CTA with `#a0d5f5` on hover/press. Selected states and badges use the brand colours at 10–40% opacity instead of extra hex values. Scores and table numbers use tabular figures.

- Filled buttons: blue fill, white text in the Claymore font, as on the website.
- Outlined buttons (secondary): blue border and text, fill blue on press.
- **Contrast:** white on `#77c3ef` is about 1.9:1, below WCAG AA. Set `highContrastCtas = true` in `theme.dart` to switch CTAs (and outlined button text) to `#111111`, about 9.6:1.

## Configure mobile push

1. Register the Android and iOS apps in the club's Firebase project. The starter uses `com.claymoresrfc.claymores` for both app IDs. Run `flutterfire configure --platforms=android,ios` and let it replace `lib/firebase_options.dart` and wire the native Firebase config.
2. In the iOS Runner target, enable Push Notifications and the Remote notifications background mode. Upload the APNs authentication key to Firebase. Test on an iPhone and use an Android device or emulator with Google Play services for Android.
3. Run on the device with `flutter run --dart-define=ENABLE_PUSH=true`. Open **Club** and opt in. Send a test notification to a device using the Firebase console, then verify topic deliveries through an authorized server or the Firebase Admin SDK. The public topics are `claymores_matches` and `claymores_practice`.
4. Use notification payloads for visible OS alerts. iOS can present alerts while the app is open. On Android, verify initial delivery with the app in the background. A foreground Android banner and automatic sending when Sanity publishes a change are follow-on work.

Use public club information in topics. Player-specific alerts should be sent by a trusted backend after it verifies who should receive them. This starter has no club Firebase project connected. Device registration and delivery still need an on-device check.

- [Firebase Flutter setup](https://firebase.google.com/docs/flutter/setup)
- [Firebase Cloud Messaging setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)

## Connect to the standalone API

Fixtures and the regular practice schedule can read from the standalone Claymores API. Set the server base URL at build time, without a trailing `/v1`:

```sh
flutter run -d chrome --dart-define=CLAYMORES_API_BASE_URL=https://api.example.com
```

The app calls `GET /v1/fixtures` and `GET /v1/practices/schedule` independently. If either call is unavailable, that data uses the normal Sanity or snapshot fallback. The practice route returns 404 until a regular schedule is published. An empty fixture list is valid and does not trigger the fallback. Without the define, the app uses its original data sources.

For Flutter Web, serve the API under the same origin or configure the API to allow the exact web origin via CORS. For development against a local API, use a same-origin reverse proxy serving the web build and forwarding `/v1/` to the API. Native release builds should use an HTTPS API URL.

Player availability still uses local device storage, keyed by the fixture's stable Sanity ID.

### Standings

The Standings tab calls `GET /v1/standings` (optionally `?season=YYYY-YYYY`) and `GET /v1/standings/seasons`. Without `CLAYMORES_API_BASE_URL` it says the standings need the club API. A 404 for a season shows "Standings TBD".

### Previewing the web build against a local API

The API only sends CORS headers for configured origins, so a web build served from another port can't read it directly. Serve the build and the API from one origin instead, e.g. a small reverse proxy that serves `build/web` and forwards `/v1/` to the API, and build with that origin as `CLAYMORES_API_BASE_URL`.

## Sign-in, profile and dues

Sign-in and dues are behind dart-defines so a release build without the config shows no broken UI:

| Define | Purpose |
|---|---|
| `ENABLE_SIGN_IN=true` | Shows the Account section under Club. Also needs the two below. |
| `CLAYMORES_API_BASE_URL` | API server, HTTPS in release builds. |
| `GOOGLE_SERVER_CLIENT_ID` | The OAuth **web** client ID the API verifies. Passed to google_sign_in as `serverClientId`, so it becomes the ID token's audience. |
| `GOOGLE_IOS_CLIENT_ID` | iOS OAuth client ID (iOS only). |
| `ENABLE_DUES=true` | Shows dues on the profile. |

```sh
flutter run --dart-define=ENABLE_SIGN_IN=true --dart-define=ENABLE_DUES=true \
  --dart-define=CLAYMORES_API_BASE_URL=https://api.example.com \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=123-web.apps.googleusercontent.com \
  --dart-define=GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
```

Google Cloud setup (per the google_sign_in docs):

- **Android:** create an Android OAuth client for `com.claymoresrfc.claymores` with the SHA-1 of each signing key (debug and release). No client ID is passed in code; the web client ID above is the server client ID.
- **iOS:** create an iOS OAuth client for the bundle ID, pass it as `GOOGLE_IOS_CLIENT_ID`, and add its *reversed* client ID (`com.googleusercontent.apps.123-ios`) as another URL scheme in `ios/Runner/Info.plist` under `CFBundleURLTypes`.
- **Web:** google_sign_in 7 can't produce an ID token from a custom button on the web, so the web build tells people to use the mobile app.

How the session works (`lib/features/auth/auth_service.dart`): the Google ID token is exchanged at `POST /v1/auth/mobile/google`. The access token stays in memory; the refresh token is kept in `flutter_secure_storage` (Keychain / Android Keystore). The app refreshes a minute before `accessTokenExpiresAt` and after any 401, with one shared refresh in flight because the API rotates refresh tokens. A 401/403 from refresh signs out. `403 {"error":"not_invited"}` shows a "Not invited yet" notice. Sign out calls `POST /v1/auth/mobile/logout`.

Dues: the profile lists `GET /v1/dues/mine`; a row opens `GET /v1/dues/mine/{id}` with payments and the pay form. The amount defaults to the full balance and must be between $0.50 and the balance. **Pay** calls `POST /v1/dues/{id}/checkout-session` with `amountCents` and opens the returned Stripe URL in the external browser. While a checkout is pending the amount is locked and **Resume checkout** resubmits `pendingCheckoutCents`.

Stripe returns to `claymores://dues?checkout=returned` or `...=cancelled`. The scheme is registered in `ios/Runner/Info.plist` and `android/app/src/main/AndroidManifest.xml`; `app_links` delivers the link and go_router opens `/club/profile?checkout=...`, which refreshes dues and explains that the balance updates after Stripe confirms. Flutter's built-in deep linking is turned off on both platforms so links aren't routed twice. The API's checkout success/cancel URLs must use these exact links.

## Checks

```sh
flutter analyze
flutter test
flutter build web
```
