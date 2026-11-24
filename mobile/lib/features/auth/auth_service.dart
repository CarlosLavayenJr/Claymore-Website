import 'dart:async';
import 'dart:convert';

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

enum JoinProvider { google, apple }

/// Who tried to sign in without an invitation, kept in memory only so they
/// can ask to join without starting over. Google keeps its ID token (the API
/// accepts it until it expires); Apple needs a fresh nonce per request, so
/// each Apple join call re-runs the Apple sheet.
class JoinIdentity {
  const JoinIdentity.google({
    required String this.idToken,
    this.name,
    this.email,
  }) : provider = JoinProvider.google;

  const JoinIdentity.apple({this.name, this.email})
    : provider = JoinProvider.apple,
      idToken = null;

  final JoinProvider provider;
  final String? idToken;

  /// Prefills the form: Google's `name` claim or Apple's first-time name.
  final String? name;
  final String? email;
}

/// Where a request to join stands, as far as this app knows.
enum JoinState {
  /// Not checked (Apple, or the check failed).
  unknown,
  checking,

  /// No request yet: show the form.
  none,
  pending,
  approved,
  denied,

  /// 429: denied recently; the club asks people to wait before asking again.
  deniedRecently,

  /// 409: this identity is already a member; sign in.
  alreadyMember,
}

/// A join form problem: [field] is `name`, `phone` or `message` for a 400.
class JoinError {
  const JoinError(this.message, {this.field});
  final String message;
  final String? field;
}

/// Reads a JWT's payload without verifying it (prefill only; the API
/// verifies the token).
Map<String, dynamic> unverifiedJwtClaims(String token) {
  final parts = token.split('.');
  if (parts.length < 2) return const {};
  try {
    final json = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    return json is Map<String, dynamic> ? json : const {};
  } on FormatException {
    return const {};
  }
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

  JoinIdentity? _join;
  JoinState _joinState = JoinState.unknown;
  String? _joinEmail;
  bool _joinBusy = false;

  /// Set after a not-invited sign-in; null otherwise.
  JoinIdentity? get joinIdentity => _join;
  JoinState get joinState => _joinState;

  /// The address a pending request was filed under.
  String? get joinEmail => _joinEmail;

  /// A join request or status check is in flight.
  bool get joinBusy => _joinBusy;

  void _resetJoin() {
    _join = null;
    _joinState = JoinState.unknown;
    _joinEmail = null;
  }

  Future<void> signIn() async {
    final api = _api, google = _google;
    if (api == null || google == null) return;
    _message = null;
    _resetJoin();
    _set(AuthStatus.signingIn);
    String? idToken;
    try {
      idToken = await google.idToken();
      if (idToken == null) return _set(AuthStatus.signedOut);
      await _accept(await api.signInWithGoogle(idToken));
    } on ApiException catch (error) {
      if (error.notInvited && idToken != null) {
        final claims = unverifiedJwtClaims(idToken);
        _join = JoinIdentity.google(
          idToken: idToken,
          name: claims['name'] is String ? claims['name'] as String : null,
          email: claims['email'] is String ? claims['email'] as String : null,
        );
        _message =
            'This Google account isn’t on the club’s member list yet. '
            'Request to join and a club admin will review it, or sign in '
            'with the address the club invited.';
        unawaited(google.signOut().catchError((Object _) {}));
        _set(AuthStatus.notInvited);
        // A returning applicant sees where their request stands.
        return checkJoinStatus();
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
    _resetJoin();
    _set(AuthStatus.signingIn);
    AppleCredential? credential;
    try {
      credential = await apple.credential();
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
        final claims = credential == null
            ? const <String, dynamic>{}
            : unverifiedJwtClaims(credential.identityToken);
        _join = JoinIdentity.apple(
          name: credential?.fullName,
          email:
              relay ??
              (claims['email'] is String ? claims['email'] as String : null),
        );
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

  /// A fresh Apple credential for one join call, or null if cancelled.
  Future<AppleCredential?> _freshApple() async => _apple?.credential();

  /// Asks the API where this identity's join request stands. For Apple this
  /// shows the Apple sheet again (each call needs a new nonce).
  Future<void> checkJoinStatus() async {
    final api = _api, join = _join;
    if (api == null || join == null || _joinBusy) return;
    final previous = _joinState;
    _joinBusy = true;
    _joinState = JoinState.checking;
    _set(_status);
    try {
      final JoinRequestStatus status;
      if (join.provider == JoinProvider.google) {
        status = await api.requestStatusWithGoogle(join.idToken!);
      } else {
        final credential = await _freshApple();
        if (credential == null) {
          _joinState = previous;
          return;
        }
        status = await api.requestStatusWithApple(
          identityToken: credential.identityToken,
          rawNonce: credential.rawNonce,
        );
      }
      _joinState = switch (status) {
        JoinRequestStatus.none => JoinState.none,
        JoinRequestStatus.pending => JoinState.pending,
        JoinRequestStatus.approved => JoinState.approved,
        JoinRequestStatus.denied => JoinState.denied,
      };
    } on ApiException catch (error) {
      if (error.statusCode == 401) _join = null;
      _joinState = JoinState.unknown;
    } on Exception {
      _joinState = JoinState.unknown;
    } finally {
      _joinBusy = false;
      _set(_status);
    }
  }

  /// Sends a request to join. Returns null when the API answered with a
  /// state ([joinState] is updated), or the problem to show on the form.
  Future<JoinError?> requestToJoin({
    required String name,
    String? phone,
    String? message,
  }) async {
    final api = _api, join = _join;
    if (api == null || join == null) {
      return const JoinError('Sign in with Google or Apple first.');
    }
    if (name.trim().isEmpty) {
      return const JoinError('Enter your name.', field: 'name');
    }
    if (_joinBusy) return null;
    _joinBusy = true;
    _set(_status);
    try {
      final JoinReply reply;
      if (join.provider == JoinProvider.google) {
        reply = await api.requestAccessWithGoogle(
          idToken: join.idToken!,
          name: name,
          phone: phone,
          message: message,
        );
      } else {
        final credential = await _freshApple();
        if (credential == null) {
          return const JoinError('Apple sign-in was cancelled. Try again.');
        }
        reply = await api.requestAccessWithApple(
          identityToken: credential.identityToken,
          rawNonce: credential.rawNonce,
          name: name,
          phone: phone,
          message: message,
        );
      }
      switch (reply.kind) {
        case JoinReplyKind.pending:
          _joinState = JoinState.pending;
          _joinEmail = reply.email ?? join.email;
        case JoinReplyKind.alreadyMember:
          _joinState = JoinState.alreadyMember;
        case JoinReplyKind.deniedRecently:
          _joinState = JoinState.deniedRecently;
        case JoinReplyKind.invalid:
          return JoinError(switch (reply.field) {
            'name' => 'Enter your full name.',
            'phone' => 'Enter a valid phone number, or leave it blank.',
            'message' => 'That message is too long. Shorten it and try again.',
            _ => 'Check the form and try again.',
          }, field: reply.field);
        case JoinReplyKind.invalidToken:
          _resetJoin();
          const expired = JoinError(
            'Your sign-in expired. Sign in again to send your request.',
          );
          _message = expired.message;
          return expired;
      }
      return null;
    } on Exception {
      return const JoinError(
        'Couldn’t send your request. Check your connection and try again.',
      );
    } finally {
      _joinBusy = false;
      _set(_status);
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
    _resetJoin();
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
    _resetJoin();
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
