import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase settings from `--dart-define`s (values from the iOS app's
/// `GoogleService-Info.plist` in the Firebase console):
///
/// - `FIREBASE_IOS_API_KEY` (`API_KEY`)
/// - `FIREBASE_IOS_APP_ID` (`GOOGLE_APP_ID`)
/// - `FIREBASE_MESSAGING_SENDER_ID` (`GCM_SENDER_ID`)
/// - `FIREBASE_PROJECT_ID` (`PROJECT_ID`)
/// - `FIREBASE_IOS_BUNDLE_ID` (defaults to `com.claymoresrfc.claymores`)
///
/// Push stays off unless `ENABLE_PUSH` is set and these are present.
class DefaultFirebaseOptions {
  static const _iosApiKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
  static const _iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
  static const _senderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _iosBundleId = String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'com.claymoresrfc.claymores',
  );

  /// The defines missing for iOS (empty when it's configured).
  static List<String> get missingIos => [
    if (_iosApiKey.isEmpty) 'FIREBASE_IOS_API_KEY',
    if (_iosAppId.isEmpty) 'FIREBASE_IOS_APP_ID',
    if (_senderId.isEmpty) 'FIREBASE_MESSAGING_SENDER_ID',
    if (_projectId.isEmpty) 'FIREBASE_PROJECT_ID',
  ];

  /// Whether this build has Firebase settings for the current platform.
  static bool get configured =>
      !kIsWeb &&
      defaultTargetPlatform == TargetPlatform.iOS &&
      missingIos.isEmpty;

  static FirebaseOptions get currentPlatform {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) {
      throw StateError(
        'Firebase isn’t configured for ${kIsWeb ? 'web' : defaultTargetPlatform.name} '
        'builds; push is iOS only for now.',
      );
    }
    final missing = missingIos;
    if (missing.isNotEmpty) {
      throw StateError(
        'Firebase isn’t configured for this build. Set ${missing.join(', ')} '
        'with --dart-define to enable push.',
      );
    }
    return const FirebaseOptions(
      apiKey: _iosApiKey,
      appId: _iosAppId,
      messagingSenderId: _senderId,
      projectId: _projectId,
      iosBundleId: _iosBundleId,
    );
  }
}
