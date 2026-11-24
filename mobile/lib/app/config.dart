/// Build-time switches, set with `--dart-define`.
abstract final class AppConfig {
  /// Server origin of the Claymores API, without the `/v1` suffix.
  static const apiBaseUrl = String.fromEnvironment('CLAYMORES_API_BASE_URL');

  /// Shows the dues section and the profile's dues ledger.
  static const duesEnabled = bool.fromEnvironment('ENABLE_DUES');

  /// Match availability pickers. Off until responses sync with the API; even
  /// then they only show to signed-in members. Everything else is public.
  static const availabilityEnabled = bool.fromEnvironment('ENABLE_AVAILABILITY');

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
