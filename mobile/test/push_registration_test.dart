import 'dart:async';
import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/club/notifications.dart';
import 'package:claymores/features/club/push_messaging.dart';
import 'package:claymores/firebase_options.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

final base = ApiBase.tryParse('https://api.example.com')!;

/// Records every messaging call; never touches Firebase.
class FakePushMessaging implements PushMessaging {
  final calls = <String>[];
  final refreshes = StreamController<String>.broadcast();
  final opened = StreamController<Map<String, dynamic>>.broadcast();
  String? currentToken = 'fcm-1';
  bool permission = true;
  Map<String, dynamic>? launchData;

  @override
  Future<void> ensureInitialized() async => calls.add('init');
  @override
  Future<bool> requestPermission() async {
    calls.add('requestPermission');
    return permission;
  }

  @override
  Future<bool> hasPermission() async => permission;

  /// How many apnsReady() checks answer false before the token arrives.
  int apnsDelayChecks = 0;

  /// Like iOS with FirebaseMessagingAutoInitEnabled off: no APNs token until
  /// auto-init is turned on (prepareForeground).
  bool apnsNeedsAutoInit = false;
  @override
  Future<bool> apnsReady() async {
    if (apnsNeedsAutoInit && !calls.contains('foreground')) return false;
    if (apnsDelayChecks > 0) {
      apnsDelayChecks--;
      return false;
    }
    return true;
  }

  @override
  Future<String?> token() async => currentToken;
  @override
  Stream<String> get onTokenRefresh => refreshes.stream;
  @override
  Future<void> subscribeToTopic(String topic) async =>
      calls.add('subscribe $topic');
  @override
  Future<void> unsubscribeFromTopic(String topic) async =>
      calls.add('unsubscribe $topic');
  @override
  Future<void> prepareForeground() async => calls.add('foreground');
  @override
  Future<Map<String, dynamic>?> initialMessageData() async => launchData;
  @override
  Stream<Map<String, dynamic>> get onMessageOpened => opened.stream;
}

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;
  @override
  Future<String?> idToken() async => 'google-id-token';
  @override
  Future<void> signOut() async {}
}

final sessionJson = jsonEncode({
  'accessToken': 'access-1',
  'accessTokenExpiresAt': DateTime.now()
      .add(const Duration(hours: 1))
      .toUtc()
      .toIso8601String(),
  'refreshToken': 'refresh-1',
  'user': {'subject': 'me', 'email': 'sam@example.com', 'role': 'player'},
});

void main() {
  late List<http.Request> requests;
  late AuthService auth;
  late MemberRepository members;
  late SharedPreferencesAsync prefs;
  late FakePushMessaging messaging;
  late List<String> opened;

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    requests = [];
    final client = MockClient((request) async {
      requests.add(request);
      return switch (request.url.path) {
        '/v1/auth/mobile/google' => http.Response(sessionJson, 200),
        '/v1/me/devices' || '/v1/me/devices/remove' => http.Response('', 204),
        _ => http.Response('', 204),
      };
    });
    auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    members = MemberRepository(
      ApiClient(base: base, client: client, tokens: auth),
    );
    prefs = SharedPreferencesAsync();
    messaging = FakePushMessaging();
    opened = [];
  });

  tearDown(() => auth.dispose());

  List<Object?> deviceCalls() => [
    for (final r in requests)
      if (r.url.path.startsWith('/v1/me/devices') ||
          r.url.path == '/v1/auth/mobile/logout')
        '${r.url.path} ${r.body}',
  ];

  Future<ClubNotifications> attached({bool enabled = true}) async {
    final notifications = ClubNotifications(
      messaging: messaging,
      enabled: enabled,
      platform: TargetPlatform.iOS,
    );
    await notifications.attach(
      auth: auth,
      members: members,
      prefs: prefs,
      open: opened.add,
    );
    addTearDown(notifications.dispose);
    return notifications;
  }

  test('without push nothing touches messaging or the API', () async {
    final notifications = await attached(enabled: false);
    expect(notifications.supported, isFalse);
    await prefs.setBool(ClubAlert.matches.prefKey, true);
    await auth.signIn();
    await pumpEventQueue();
    messaging.refreshes.add('fcm-2');
    await pumpEventQueue();
    expect(messaging.calls, isEmpty);
    expect(deviceCalls(), isEmpty);
  });

  test('Firebase options explain what is missing', () {
    // Tests run without the FIREBASE_* defines.
    expect(DefaultFirebaseOptions.configured, isFalse);
    expect(
      () => DefaultFirebaseOptions.currentPlatform,
      throwsA(isA<StateError>()),
    );
  });

  test(
    'turning on match updates subscribes and registers the device',
    () async {
      final notifications = await attached();
      await auth.signIn();
      await pumpEventQueue();
      // Match updates are off: signing in registers nothing.
      expect(deviceCalls(), isEmpty);

      await notifications.subscribe(ClubAlert.matches, true);
      expect(
        messaging.calls,
        containsAllInOrder(['subscribe claymores_matches']),
      );
      expect(deviceCalls(), [
        '/v1/me/devices {"token":"fcm-1","platform":"ios"}',
      ]);
      final register = requests.lastWhere(
        (r) => r.url.path == '/v1/me/devices',
      );
      expect(register.method, 'POST');
      expect(register.headers['Authorization'], 'Bearer access-1');

      await notifications.subscribe(ClubAlert.matches, false);
      expect(messaging.calls.last, 'unsubscribe claymores_matches');
      expect(deviceCalls().last, '/v1/me/devices/remove {"token":"fcm-1"}');
    },
  );

  test('waits for a slow APNs token instead of failing', () async {
    final notifications = await attached();
    notifications.apnsPollInterval = Duration.zero;
    await auth.signIn();
    messaging.apnsDelayChecks = 5;
    await notifications.subscribe(ClubAlert.matches, true);
    expect(messaging.calls, contains('subscribe claymores_matches'));
    expect(deviceCalls(), [
      '/v1/me/devices {"token":"fcm-1","platform":"ios"}',
    ]);
  });

  test('turns on auto-init before waiting for the APNs token', () async {
    final notifications = await attached();
    notifications.apnsPollInterval = Duration.zero;
    await auth.signIn();
    messaging.apnsNeedsAutoInit = true;
    await notifications.subscribe(ClubAlert.matches, true);
    expect(messaging.calls, contains('subscribe claymores_matches'));
    expect(deviceCalls(), [
      '/v1/me/devices {"token":"fcm-1","platform":"ios"}',
    ]);
  });

  test('still explains when the APNs token never arrives', () async {
    final notifications = await attached();
    notifications.apnsPollInterval = Duration.zero;
    await auth.signIn();
    messaging.apnsDelayChecks = 1000;
    await expectLater(
      notifications.subscribe(ClubAlert.matches, true),
      throwsA(isA<StateError>()),
    );
    expect(messaging.calls, isNot(contains('subscribe claymores_matches')));
  });

  test('practice updates only use the topic', () async {
    final notifications = await attached();
    await auth.signIn();
    await notifications.subscribe(ClubAlert.practice, true);
    expect(messaging.calls, contains('subscribe claymores_practice'));
    expect(deviceCalls(), isEmpty);
  });

  test(
    're-registers after sign-in and on token refresh, removes on sign-out',
    () async {
      await prefs.setBool(ClubAlert.matches.prefKey, true);
      await attached();
      expect(deviceCalls(), isEmpty); // signed out: nothing to register

      await auth.signIn();
      await pumpEventQueue();
      expect(deviceCalls(), [
        '/v1/me/devices {"token":"fcm-1","platform":"ios"}',
      ]);

      messaging.refreshes.add('fcm-2');
      await pumpEventQueue();
      expect(
        deviceCalls().last,
        '/v1/me/devices {"token":"fcm-2","platform":"ios"}',
      );

      await auth.signOut();
      await pumpEventQueue();
      // Removed with the session still valid, before the logout call.
      expect(deviceCalls().sublist(2), [
        '/v1/me/devices/remove {"token":"fcm-2"}',
        '/v1/auth/mobile/logout {"refreshToken":"refresh-1"}',
      ]);
      final remove = requests.firstWhere(
        (r) => r.url.path == '/v1/me/devices/remove',
      );
      expect(remove.headers['Authorization'], 'Bearer access-1');

      // Signed out: a new token isn't sent anywhere.
      messaging.refreshes.add('fcm-3');
      await pumpEventQueue();
      expect(deviceCalls(), hasLength(4));
    },
  );

  test('a notification about a match opens it', () async {
    messaging.launchData = {'fixtureId': 'launch-match', 'type': 'match'};
    await attached();
    expect(opened, ['/match/launch-match']);

    messaging.opened.add({'fixtureId': 'abc 1', 'type': 'match'});
    messaging.opened.add({'type': 'news'});
    await pumpEventQueue();
    expect(opened, ['/match/launch-match', '/match/abc%201']);
  });
}
