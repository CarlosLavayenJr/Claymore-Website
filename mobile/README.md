# Claymores RFC · Flutter starter

A club app for players, friends, and family. Home shows the next match and practice details. Fixtures shows the upcoming schedule and a season-filtered history. Club contains the player preview and notification settings.

## Run it

Verified with Flutter 3.50.1 and Dart 3.14.0. Open this folder in an editor with the Flutter and Dart extensions, or run these commands from this folder with Flutter on your PATH.

```sh
flutter pub get
flutter run -d chrome
```

The browser preview uses a labeled November 23, 2026 Sanity snapshot. Native builds fetch the published Sanity feed and fall back to the snapshot when the feed is unavailable. To use live Sanity in a browser deployment, allow its exact origin in Sanity and build with `--dart-define=SANITY_WEB_LIVE=true`.

To try availability, open **Club**, turn on **Player preview**, return to **Home**, and tap a response on the fixture. Responses are saved by fixture ID on this device and are also shown for that fixture on the Fixtures tab. Preview mode resets when you restart the app. It is a UI demo for the eventual signed-in player experience.

Dues are off by default. To reveal the placeholder, run with `--dart-define=ENABLE_DUES=true` and turn on Player preview. The skeleton has no checkout, Venmo destination, or dues ledger.

## Learn Flutter from this project

1. Open `lib/main.dart` and find `ClaymoresApp`. `MaterialApp` sets the theme and `Scaffold` provides the app bar, body, and navigation. Change the practice heading and use hot reload to see how Flutter rebuilds the interface.
2. Find `ClubShell`. Selecting a tab changes local state with `setState`. `FutureBuilder` renders loading, error, or content according to what the repository returned.
3. Find `FixtureCard` and `AvailabilityPicker`. The card renders the fixture it receives. The picker owns its saving state and uses `SharedPreferencesAsync` to keep the response between visits.
4. Follow `ClubRepository.load` in `lib/club_data.dart`. The GROQ query in `assets/club.groq` projects Sanity fields into a small public payload. Dart converts that payload into typed fixtures and practice data. Match dates use Orlando's calendar day.
5. Open `lib/notifications.dart` to see how the app asks permission and subscribes to separate public match and practice topics.

The theme uses the website styling guide's white surfaces, Claymore display font, blue, pink and divider colors. Blue controls use dark text for legibility. The crest comes from the Clubhouse dashboard assets. Featured fixtures use team logos from Sanity when present.

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

Player availability still uses local device storage, keyed by the fixture's stable Sanity ID. A future server-side flow can upsert the fixture ID and authenticated player ID after checking club membership. This Flutter app has no sign-in or server-side availability yet.

## Checks

```sh
flutter analyze
flutter test
flutter build web
```
