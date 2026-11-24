import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../firebase_options.dart';

enum ClubAlert {
  matches('Match updates', 'claymores_matches'),
  practice('Practice updates', 'claymores_practice');

  const ClubAlert(this.label, this.topic);
  final String label, topic;
}

class ClubNotifications {
  const ClubNotifications();

  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android) &&
      const bool.fromEnvironment('ENABLE_PUSH');

  Future<void> subscribe(ClubAlert alert, bool enabled) async {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
    final messaging = FirebaseMessaging.instance;
    if (!enabled) {
      await messaging.unsubscribeFromTopic(alert.topic);
      return;
    }

    final permission = await messaging.requestPermission();
    if (permission.authorizationStatus == AuthorizationStatus.denied ||
        permission.authorizationStatus == AuthorizationStatus.notDetermined) {
      throw StateError('Allow notifications in your device settings first.');
    }
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await messaging.getAPNSToken() == null) {
      throw StateError(
        'The device is still setting up push. Try again shortly.',
      );
    }
    await messaging.setAutoInitEnabled(true);
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }
    await messaging.subscribeToTopic(alert.topic);
  }
}
