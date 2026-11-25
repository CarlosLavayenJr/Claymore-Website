/// Build-time switches, set with `--dart-define`.
abstract final class AppConfig {
  /// Server origin of the Claymores API, without the `/v1` suffix.
  static const apiBaseUrl = String.fromEnvironment('CLAYMORES_API_BASE_URL');

  /// Shows the dues section and the profile's dues ledger.
  static const duesEnabled = bool.fromEnvironment('ENABLE_DUES');

  /// Match availability ("can you play?") and lineups, synced with the API.
  /// On by default; they only show to signed-in members (everything else is
  /// public). `--dart-define=ENABLE_AVAILABILITY=false` switches them off.
  static const availabilityEnabled = bool.fromEnvironment(
    'ENABLE_AVAILABILITY',
    defaultValue: true,
  );

  /// Match and practice notification switches under the Club tab. Off until
  /// push is configured (APNs key, Firebase): App Review rejects controls that
  /// don't work. The switches only work with [pushEnabled] and the Firebase
  /// defines (see `firebase_options.dart`).
  static const notificationsEnabled = bool.fromEnvironment(
    'ENABLE_NOTIFICATIONS',
  );

  /// Firebase Cloud Messaging (topics and device registration for match
  /// reminders). Off unless set; also needs the Firebase defines.
  static const pushEnabled = bool.fromEnvironment('ENABLE_PUSH');

  /// Shows Google sign-in under the Club tab.
  static const signInEnabled = bool.fromEnvironment('ENABLE_SIGN_IN');

  /// Offers Sign in with Apple next to Google on iOS (App Store guideline
  /// 4.8). On by default; it still needs `ENABLE_SIGN_IN` and the API URL.
  static const appleSignInEnabled = bool.fromEnvironment(
    'ENABLE_APPLE_SIGN_IN',
    defaultValue: true,
  );

  /// OAuth *web* client ID. Passed to google_sign_in as `serverClientId` so
  /// the ID token's audience is the one the API verifies.
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  /// iOS OAuth client ID. Android needs none: Google matches the package name
  /// and signing certificate registered in Google Cloud.
  static const googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );
}
