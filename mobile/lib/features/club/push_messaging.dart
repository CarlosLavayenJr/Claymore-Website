import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../firebase_options.dart';

/// The Firebase Cloud Messaging calls the app makes, behind an interface so
/// tests (and builds without push) never touch Firebase.
abstract interface class PushMessaging {
  /// Initializes Firebase on first use.
  Future<void> ensureInitialized();

  /// Asks to show notifications. False when the person declined.
  Future<bool> requestPermission();

  /// Whether the person already allowed notifications (doesn't prompt).
  Future<bool> hasPermission();

  /// iOS: whether APNs has issued this device a token yet.
  Future<bool> apnsReady();

  /// The FCM registration token, or null when there isn't one yet.
  Future<String?> token();

  Stream<String> get onTokenRefresh;

  Future<void> subscribeToTopic(String topic);
  Future<void> unsubscribeFromTopic(String topic);

  /// Shows alerts while the app is open (iOS) and turns on auto-init.
  Future<void> prepareForeground();

  /// The data of the notification that launched the app, if any.
  Future<Map<String, dynamic>?> initialMessageData();

  /// The data of notifications opened while the app is running.
  Stream<Map<String, dynamic>> get onMessageOpened;
}

/// [PushMessaging] backed by `firebase_messaging`.
class FirebasePushMessaging implements PushMessaging {
  const FirebasePushMessaging();

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  @override
  Future<void> ensureInitialized() async {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
  }

  static bool _allowed(AuthorizationStatus status) =>
      status == AuthorizationStatus.authorized ||
      status == AuthorizationStatus.provisional;

  @override
  Future<bool> requestPermission() async =>
      _allowed((await _messaging.requestPermission()).authorizationStatus);

  @override
  Future<bool> hasPermission() async => _allowed(
    (await _messaging.getNotificationSettings()).authorizationStatus,
  );

  @override
  Future<bool> apnsReady() async =>
      defaultTargetPlatform != TargetPlatform.iOS ||
      await _messaging.getAPNSToken() != null;

  // The API sends with FCM HTTP v1 `message.token`, i.e. classic
  // registration tokens, not the installation IDs that register() and
  // onRegistered report. Move both together if the API changes.
  @override
  // ignore: deprecated_member_use
  Future<String?> token() => _messaging.getToken();

  @override
  // ignore: deprecated_member_use
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Future<void> subscribeToTopic(String topic) =>
      _messaging.subscribeToTopic(topic);

  @override
  Future<void> unsubscribeFromTopic(String topic) =>
      _messaging.unsubscribeFromTopic(topic);

  @override
  Future<void> prepareForeground() async {
    await _messaging.setAutoInitEnabled(true);
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }
  }

  @override
  Future<Map<String, dynamic>?> initialMessageData() async =>
      (await _messaging.getInitialMessage())?.data;

  @override
  Stream<Map<String, dynamic>> get onMessageOpened =>
      FirebaseMessaging.onMessageOpenedApp.map((message) => message.data);
}
