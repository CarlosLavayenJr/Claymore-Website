import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../data/api_client.dart';
import '../../data/auth_api.dart';
import '../../data/models/account.dart';
import 'auth_platform.dart';

enum AuthStatus {
  /// Sign-in is not configured for this build.
  disabled,
  signedOut,
  restoring,
  signingIn,
  signedIn,

  /// The Google account or Apple ID is valid but has no club invitation (403).
  notInvited,
  failed,
}

/// Owns the session: access token in memory, refresh token in secure storage.
///
/// Access tokens are refreshed shortly before they expire (timer and on
/// demand) and after a 401. Concurrent refreshes share one request, because
/// the API rotates the refresh token and a second use would be rejected.
class AuthService extends ChangeNotifier implements AccessTokenSource {
  AuthService({
    required AuthApi this._api,
    required this._store,
    this._google,
    this._apple,
    DateTime Function()? now,
    this.refreshLeeway = const Duration(seconds: 60),
  }) : _now = now ?? DateTime.now,
       _status = AuthStatus.signedOut;

  AuthService.disabled()
    : _api = null,
      _store = MemoryTokenStore(),
      _google = null,
      _apple = null,
      _now = DateTime.now,
      refreshLeeway = Duration.zero,
      _status = AuthStatus.disabled;

  final AuthApi? _api;
  final TokenStore _store;
  final IdTokenSource? _google;
  final AppleCredentialSource? _apple;
  final DateTime Function() _now;
  final Duration refreshLeeway;

  AuthStatus _status;
  AuthSession? _session;
  String? _message;
  Future<AuthSession?>? _refreshing;
  Timer? _timer;
  bool _disposed = false;

  AuthStatus get status => _status;
  AuthUser? get user => _session?.user;
  bool get signedIn => _status == AuthStatus.signedIn && _session != null;
  bool get enabled => _api != null;

  /// Google sign-in can be attempted on this platform (Google SDK available).
  bool get canSignIn => enabled && (_google?.supported ?? false);

  /// Sign in with Apple can be attempted (iOS only).
  bool get canSignInWithApple => enabled && (_apple?.supported ?? false);

  /// A message for the last failure, suitable for the UI.
  String? get message => _message;

  /// Restores a saved session at launch.
  Future<void> restore() async {
    if (!enabled) return;
    final saved = await _store.read();
    if (saved == null) return _set(AuthStatus.signedOut);
    _set(AuthStatus.restoring);
    await _refresh();
  }

  Future<void> signIn() async {
    final api = _api, google = _google;
    if (api == null || google == null) return;
    _message = null;
    _set(AuthStatus.signingIn);
    try {
      final idToken = await google.idToken();
      if (idToken == null) return _set(AuthStatus.signedOut);
      await _accept(await api.signInWithGoogle(idToken));
    } on ApiException catch (error) {
      if (error.notInvited) {
        _message =
            'This Google account hasn’t been invited to the club app. '
            'Ask a club admin for an invitation, or use the address they invited.';
        unawaited(google.signOut().catchError((Object _) {}));
        return _set(AuthStatus.notInvited);
      }
      _fail(error, 'Google');
    } on Exception {
      _message =
          'Sign-in didn’t complete. Check your connection and try again.';
      _set(AuthStatus.failed);
    }
  }

  Future<void> signInWithApple() async {
    final api = _api, apple = _apple;
    if (api == null || apple == null) return;
    _message = null;
    _set(AuthStatus.signingIn);
    try {
      final credential = await apple.credential();
      if (credential == null) return _set(AuthStatus.signedOut);
      await _accept(
        await api.signInWithApple(
          identityToken: credential.identityToken,
          rawNonce: credential.rawNonce,
          fullName: credential.fullName,
        ),
      );
    } on ApiException catch (error) {
      if (error.notInvited) {
        final relay = error.email;
        _message = relay != null
            ? 'This Apple ID shares a private relay email ($relay). '
                  'Ask a club admin to invite that address, or sign in with Google.'
            : 'The email on this Apple ID hasn’t been invited to the club app. '
                  'Ask a club admin for an invitation, or sign in with Google.';
        return _set(AuthStatus.notInvited);
      }
      _fail(error, 'Apple');
    } on Exception {
      _message =
          'Sign-in didn’t complete. Check your connection and try again.';
      _set(AuthStatus.failed);
    }
  }

  void _fail(ApiException error, String provider) {
    _message = error.statusCode == 401
        ? '$provider sign-in couldn’t be verified. Try again.'
        : 'The club server couldn’t sign you in (${error.statusCode}).';
    _set(AuthStatus.failed);
  }

  Future<void> signOut() async {
    final api = _api;
    final token = _session?.refreshToken ?? await _store.read();
    _timer?.cancel();
    _session = null;
    _message = null;
    await _store.clear();
    _set(enabled ? AuthStatus.signedOut : AuthStatus.disabled);
    if (api != null && token != null) {
      unawaited(api.logout(token).catchError((Object _) {}));
    }
    unawaited(_google?.signOut().catchError((Object _) {}));
  }

  @override
  Future<String?> accessToken() async {
    final session = _session;
    if (session == null) return (await _refreshing)?.accessToken;
    if (_now().isBefore(session.accessTokenExpiresAt.subtract(refreshLeeway))) {
      return session.accessToken;
    }
    return (await _refresh())?.accessToken;
  }

  @override
  Future<String?> refreshAfterUnauthorized(String rejected) async {
    final session = _session;
    // Another request already refreshed; use its token.
    if (session != null && session.accessToken != rejected) {
      return session.accessToken;
    }
    return (await _refresh())?.accessToken;
  }

  /// Single-flight refresh.
  Future<AuthSession?> _refresh() =>
      _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<AuthSession?> _doRefresh() async {
    final api = _api;
    final token = _session?.refreshToken ?? await _store.read();
    if (api == null || token == null) {
      _session = null;
      _set(enabled ? AuthStatus.signedOut : AuthStatus.disabled);
      return null;
    }
    try {
      final session = await api.refresh(token);
      await _accept(session);
      return session;
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        _timer?.cancel();
        _session = null;
        await _store.clear();
        _message = error.notInvited
            ? 'Your club invitation is no longer active.'
            : 'Your session ended. Sign in again.';
        _set(error.notInvited ? AuthStatus.notInvited : AuthStatus.signedOut);
        return null;
      }
      return _keepAfterTransientFailure();
    } on Exception {
      return _keepAfterTransientFailure();
    }
  }

  /// Network trouble: keep the saved refresh token so a retry can succeed.
  AuthSession? _keepAfterTransientFailure() {
    if (_session == null) {
      _message = 'Couldn’t reach the club server to restore your sign-in.';
      _set(AuthStatus.failed);
    }
    return null;
  }

  Future<void> _accept(AuthSession session) async {
    _session = session;
    _message = null;
    await _store.write(session.refreshToken);
    _schedule(session);
    _set(AuthStatus.signedIn);
  }

  void _schedule(AuthSession session) {
    _timer?.cancel();
    var wait = session.accessTokenExpiresAt.difference(_now()) - refreshLeeway;
    if (wait.isNegative) wait = Duration.zero;
    _timer = Timer(wait, () => unawaited(_refresh()));
  }

  void _set(AuthStatus status) {
    _status = status;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
