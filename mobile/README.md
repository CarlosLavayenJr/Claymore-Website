# Claymores RFC · Flutter starter

A club app for players, friends, and family. Home shows the next match and practice details. Fixtures shows the upcoming schedule and a season-filtered history. Standings shows the league table and playoffs from the club API. The whole app is public. Signing in is only for member features: today that's dues, and later game availability. Club contains notification settings and (when configured) Google sign-in and, on iOS, Sign in with Apple, which leads to a profile with dues and card payments.

## Run it

Verified with Flutter 3.50.1 and Dart 3.14.0. Open this folder in an editor with the Flutter and Dart extensions, or run these commands from this folder with Flutter on your PATH.

```sh
flutter pub get
flutter run -d chrome
```

The browser preview uses a labeled November 23, 2026 Sanity snapshot. Native builds fetch the published Sanity feed and fall back to the snapshot when the feed is unavailable. To use live Sanity in a browser deployment, allow its exact origin in Sanity and build with `--dart-define=SANITY_WEB_LIVE=true`.

Match availability is hidden until it syncs with the API. Build with `--dart-define=ENABLE_AVAILABILITY=true` to show the pickers; even then they appear only for signed-in members. Responses are still saved on the device by fixture ID.

Dues are off by default (`--dart-define=ENABLE_DUES=true`) and only appear once a member signs in. The profile then lists their dues and lets them pay by card (below).

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
  shared/widgets.dart       SectionHeading, BrandHeader, Panel, Eyebrow, StatusPanel, DirectionsButton
  shared/team_logo.dart     TeamLogo: Sanity logo -> bundled assets/teams/*.png -> monogram
  data/teams.dart           TeamDirectory (GET /v1/teams + bundled list) and TeamResolver,
                            a port of the API's TeamNameResolver (names, aliases, normalized match)
```

Routing uses go_router: a `StatefulShellRoute` keeps each tab's state (`/home`, `/fixtures`, `/standings`, `/club`); match details (`/match/:id`), request to join (`/club/join`), the profile (`/club/profile`) and dues (`/club/profile/dues/:id`) open above the tabs with a back button. State is plain `ChangeNotifier`/`ValueNotifier` handed down by an `InheritedWidget` (`AppScope`): there are only a few shared values (schedule, current standings table, team directory, preview switch, session), so a state-management package would add more than it saves.

The UI imports `package:material_ui/material_ui.dart`. That is the official Material library decoupled from the SDK; in Flutter 3.50 `package:flutter/material.dart` is deprecated in its favour, and go_router uses it too, so keep it.

## Learn Flutter from this project

1. Open `lib/app/app.dart` and find `ClaymoresApp`. `MaterialApp.router` takes the theme from `lib/app/theme.dart` and the routes from `lib/app/router.dart`. Change the practice heading in `lib/features/home/home_page.dart` and hot reload.
2. `ClubShell` in `router.dart` draws the app bar and the four tabs. `ClubDataView` renders loading, error or content for the shared schedule (`ClubDataController`).
3. `FixtureCard` and `AvailabilityPicker` live in `lib/features/fixtures/`. The picker saves through `AvailabilityStore`, which uses `SharedPreferencesAsync` and notifies every tab.
4. Follow `ClubRepository.load` in `lib/data/club_repository.dart`. The GROQ query in `assets/club.groq` projects Sanity fields into a small public payload. Match dates use Orlando's calendar day.
5. `lib/features/club/notifications.dart` asks permission and subscribes to separate public match and practice topics.

## Request to join

When Google or Apple sign-in returns 403 `not_invited`, the app keeps that identity in memory and opens `/club/join`: name (prefilled from the Google token or Apple's first-time name), optional phone and message, sent to `POST /v1/auth/mobile/{google|apple}/request-access`. After a not-invited Google sign-in the app also calls `request-status` so returning applicants see pending, approved (sign in) or declined. Apple needs a fresh nonce per call, so each Apple join call shows the Apple sheet again, and its status check is a button rather than automatic.

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
| `ENABLE_SIGN_IN=true` | Shows the Account section under Club. Also needs the API URL and at least one provider (Google client ID, or Apple on iOS). |
| `CLAYMORES_API_BASE_URL` | API server, HTTPS in release builds. |
| `GOOGLE_SERVER_CLIENT_ID` | The OAuth **web** client ID the API verifies. Passed to google_sign_in as `serverClientId`, so it becomes the ID token's audience. Without it, Google sign-in is hidden. |
| `GOOGLE_IOS_CLIENT_ID` | iOS OAuth client ID (iOS only). |
| `ENABLE_APPLE_SIGN_IN` | Sign in with Apple, iOS only. Defaults to `true`; set `false` to hide it. |
| `ENABLE_DUES=true` | Shows dues on the profile. |
| `ENABLE_AVAILABILITY=true` | Shows match availability pickers to signed-in members (local only for now). |

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

### Sign in with Apple (iOS)

App Store guideline 4.8 requires Sign in with Apple because the app offers Google sign-in, so on iOS the Account section shows Apple's black **Sign in with Apple** button under the Google button. It isn't shown on Android or the web.

- Each attempt makes a random 64-character raw nonce, passes its lowercase hex SHA-256 to Apple (`SignInWithApple.getAppleIDCredential(nonce: ...)`), and sends `{"identityToken", "rawNonce", "fullName"}` to `POST /v1/auth/mobile/apple`. The API checks that the token's `nonce` claim is the hash of `rawNonce`.
- Apple shares the person's name only the first time they authorize the app. The app sends it then, and the API keeps it.
- If someone chose **Hide My Email**, Apple gives a `@privaterelay.appleid.com` address that won't match their invitation. The API answers `403 {"error":"not_invited","email":"..."}` and the app shows: "This Apple ID shares a private relay email (x@privaterelay.appleid.com). Ask a club admin to invite that address, or sign in with Google."
- `ios/Runner/Runner.entitlements` holds the `com.apple.developer.applesignin` capability and is set as `CODE_SIGN_ENTITLEMENTS` for Debug, Release and Profile. The App ID must have **Sign in with Apple** enabled in the Apple Developer portal (see `api/README.md`), or signing fails.

**Run it on an iPhone.** The simulator can show Apple's sheet but needs a signed-in Apple ID and is unreliable, so use a device:

1. Open `ios/Runner.xcworkspace` in Xcode. Under **Runner > Signing & Capabilities**, choose the club's team. With automatic signing Xcode creates or updates the provisioning profile with the Sign in with Apple capability from `Runner.entitlements`. A free personal team can't use this capability.
2. Connect the iPhone (Developer Mode on), then run from this folder:

   ```sh
   flutter run -d <iphone-id> --dart-define=ENABLE_SIGN_IN=true \
     --dart-define=CLAYMORES_API_BASE_URL=https://api.example.com \
     --dart-define=GOOGLE_SERVER_CLIENT_ID=123-web.apps.googleusercontent.com \
     --dart-define=GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
   ```

   `flutter devices` lists the device ID. The API must have `Authentication__Apple__ClientIds__0=com.claymoresrfc.claymores` and mobile sign-in enabled.
3. Open **Club** and tap **Sign in with Apple**. To see the first-time flow again (name and email choice), remove the app under **Settings > [your name] > Sign-In & Security > Sign in with Apple** on the iPhone.

How the session works (`lib/features/auth/auth_service.dart`): the Google ID token is exchanged at `POST /v1/auth/mobile/google`. The access token stays in memory; the refresh token is kept in `flutter_secure_storage` (Keychain / Android Keystore). The app refreshes a minute before `accessTokenExpiresAt` and after any 401, with one shared refresh in flight because the API rotates refresh tokens. A 401/403 from refresh signs out. `403 {"error":"not_invited"}` shows a "Not invited yet" notice. Sign out calls `POST /v1/auth/mobile/logout`.

Dues: the profile lists `GET /v1/dues/mine`; a row opens `GET /v1/dues/mine/{id}` with payments and the pay form. The amount defaults to the full balance and must be between $0.50 and the balance. **Pay** calls `POST /v1/dues/{id}/checkout-session` with `amountCents` and opens the returned Stripe URL in the external browser. While a checkout is pending the amount is locked and **Resume checkout** resubmits `pendingCheckoutCents`.

Stripe returns to `claymores://dues?checkout=returned` or `...=cancelled`. The scheme is registered in `ios/Runner/Info.plist` and `android/app/src/main/AndroidManifest.xml`; `app_links` delivers the link and go_router opens `/club/profile?checkout=...`, which refreshes dues and explains that the balance updates after Stripe confirms. Flutter's built-in deep linking is turned off on both platforms so links aren't routed twice. The API's checkout success/cancel URLs must use these exact links.

## Checks

```sh
flutter analyze
flutter test
flutter build web
```
