import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/config.dart';
import '../../data/member_repository.dart';
import '../../firebase_options.dart';
import '../auth/auth_service.dart';
import 'push_messaging.dart';

enum ClubAlert {
  matches('Match updates', 'claymores_matches'),
  practice('Practice updates', 'claymores_practice');

  const ClubAlert(this.label, this.topic);
  final String label, topic;

  /// Where the switch is remembered.
  String get prefKey => 'alerts.$name';
}

/// Push notifications: club-wide topics, plus (for signed-in members with
/// "Match updates" on) this device's token registered with the API so the
/// club can send personal reminders and lineup notices.
///
/// Inert unless [supported]: without `ENABLE_PUSH` and the Firebase defines
/// nothing here touches Firebase.
class ClubNotifications {
  ClubNotifications({
    this.messaging = const FirebasePushMessaging(),
    this._enabled,
    this._platform,
  });

  final PushMessaging messaging;
  final bool? _enabled;
  final TargetPlatform? _platform;

  TargetPlatform get platform => _platform ?? defaultTargetPlatform;

  bool get supported =>
      _enabled ??
      (!kIsWeb &&
          (platform == TargetPlatform.iOS ||
              platform == TargetPlatform.android) &&
          AppConfig.pushEnabled &&
          DefaultFirebaseOptions.configured);

  String get _platformName =>
      platform == TargetPlatform.iOS ? 'ios' : 'android';

  AuthService? _auth;
  MemberRepository? _members;
  SharedPreferencesAsync? _prefs;
  String? _subject;

  /// The token last registered with the API for the signed-in member.
  String? _registered;
  final _subscriptions = <StreamSubscription<Object?>>[];
  bool _attached = false;

  /// Starts device registration and notification taps. Called once at
  /// launch; does nothing unless [supported].
  Future<void> attach({
    required AuthService auth,
    required MemberRepository? members,
    required SharedPreferencesAsync prefs,
    required void Function(String location) open,
  }) async {
    if (!supported || _attached) return;
    _attached = true;
    _auth = auth;
    _members = members;
    _prefs = prefs;
    auth.addListener(_authChanged);
    auth.addSignOutHook(_beforeSignOut);
    try {
      await messaging.ensureInitialized();
      _subscriptions
        ..add(
          messaging.onTokenRefresh.listen(
            (token) => unawaited(_quietly(() => _register(token: token))),
          ),
        )
        ..add(messaging.onMessageOpened.listen((data) => _opened(data, open)));
      final initial = await messaging.initialMessageData();
      if (initial != null) _opened(initial, open);
    } on Object catch (error) {
      debugPrint('Push setup failed: $error');
    }
    _authChanged();
  }

  /// `/match/{id}` for a notification about a match.
  static String? locationFor(Map<String, dynamic> data) {
    final id = data['fixtureId'];
    return id is String && id.isNotEmpty
        ? '/match/${Uri.encodeComponent(id)}'
        : null;
  }

  void _opened(Map<String, dynamic> data, void Function(String) open) {
    final location = locationFor(data);
    if (location != null) open(location);
  }

  void _authChanged() {
    final auth = _auth;
    final subject = auth != null && auth.signedIn ? auth.user?.subject : null;
    if (subject == _subject) return;
    _subject = subject;
    if (subject == null) {
      _registered = null;
      return;
    }
    // After sign-in (or a restored session): register again if this device
    // already has match updates on and notifications allowed.
    unawaited(
      _quietly(() async {
        if (await messaging.hasPermission()) await _register();
      }),
    );
  }

  Future<bool> _matchAlertsOn() async =>
      await _prefs?.getBool(ClubAlert.matches.prefKey) ?? false;

  /// Sends this device's token to the API when a member is signed in and
  /// match updates are on ([force]: being switched on right now).
  Future<void> _register({String? token, bool force = false}) async {
    final members = _members;
    final auth = _auth;
    if (members == null || auth == null || !auth.signedIn) return;
    if (!force && !await _matchAlertsOn()) return;
    if (!await messaging.apnsReady()) return;
    final value = token ?? await messaging.token();
    if (value == null || value.isEmpty) return;
    await members.registerDevice(value, _platformName);
    _registered = value;
  }

  /// Stops personal pushes to this device for the signed-in member.
  Future<void> _unregister() async {
    final members = _members;
    final auth = _auth;
    if (members == null || auth == null || !auth.signedIn) return;
    final token = _registered ?? await messaging.token();
    if (token == null || token.isEmpty) return;
    await members.removeDevice(token);
    _registered = null;
  }

  /// Runs before the session's tokens are dropped, while the API still
  /// accepts them.
  Future<void> _beforeSignOut() async {
    if (_registered == null && !await _matchAlertsOn()) return;
    await _unregister();
  }

  static Future<void> _quietly(Future<void> Function() action) async {
    try {
      await action();
    } on Object catch (error) {
      debugPrint('Push device update failed: $error');
    }
  }

  Future<void> subscribe(ClubAlert alert, bool enabled) async {
    await messaging.ensureInitialized();
    if (!enabled) {
      await messaging.unsubscribeFromTopic(alert.topic);
      if (alert == ClubAlert.matches) await _quietly(_unregister);
      return;
    }

    if (!await messaging.requestPermission()) {
      throw StateError('Allow notifications in your device settings first.');
    }
    // iOS hands out the APNs token a moment after permission is granted.
    if (!await _waitForApns()) {
      throw StateError(
        'The device is still setting up push. Try again shortly.',
      );
    }
    await messaging.prepareForeground();
    await messaging.subscribeToTopic(alert.topic);
    if (alert == ClubAlert.matches) {
      await _quietly(() => _register(force: true));
    }
  }

  /// Polls for the APNs token for up to [attempts] half-second waits.
  Future<bool> _waitForApns({int attempts = 20}) async {
    for (var i = 0; i < attempts; i++) {
      if (await messaging.apnsReady()) return true;
      await Future<void>.delayed(apnsPollInterval);
    }
    return messaging.apnsReady();
  }

  /// How long to wait between APNs token checks; tests shorten it.
  @visibleForTesting
  Duration apnsPollInterval = const Duration(milliseconds: 500);

  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    _subscriptions.clear();
    _auth?.removeListener(_authChanged);
    _auth?.removeSignOutHook(_beforeSignOut);
  }
}
