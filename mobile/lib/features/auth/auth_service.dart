import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../data/api_client.dart';
import '../../data/auth_api.dart';
import '../../data/member_repository.dart';
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
    this.minRefreshDelay = const Duration(seconds: 30),
  }) : _now = now ?? DateTime.now,
       _status = AuthStatus.signedOut;

  AuthService.disabled()
    : _api = null,
      _store = MemoryTokenStore(),
      _google = null,
      _apple = null,
      _now = DateTime.now,
      refreshLeeway = Duration.zero,
      minRefreshDelay = Duration.zero,
      _status = AuthStatus.disabled;

  final AuthApi? _api;
  final TokenStore _store;
  final IdTokenSource? _google;
  final AppleCredentialSource? _apple;
  final DateTime Function() _now;

  /// Refresh this long before the access token expires.
  final Duration refreshLeeway;

  /// The soonest a new session is refreshed, however short its lifetime, so
  /// a bad expiry can never cause a refresh loop.
  final Duration minRefreshDelay;

  AuthStatus _status;
  AuthSession? _session;

  /// Local clock time after which [_session]'s access token is refreshed.
  DateTime? _refreshDue;

  @visibleForTesting
  DateTime? get refreshDue => _refreshDue;
  String? _message;
  Future<AuthSession?>? _refreshing;
  Timer? _timer;
  bool _disposed = false;

  /// Bumped by sign-in, sign-out and account deletion. A refresh or sign-in
  /// that started under an older generation is dropped when it completes, so
  /// signing out while a refresh is in flight can't sign the user back in.
  int _generation = 0;

  /// The launch restore failed for a transient reason and the refresh token
  /// is still stored, so it can be retried.
  bool _restoreFailed = false;

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
    final generation = _generation;
    final saved = await _readStored();
    if (generation != _generation) return;
    if (saved == null) {
      _restoreFailed = false;
      return _set(AuthStatus.signedOut);
    }
    _set(AuthStatus.restoring);
    await _refresh();
  }

  /// The launch restore couldn't reach the server; [retryRestore] can try
  /// again with the stored refresh token.
  bool get canRetryRestore => _status == AuthStatus.failed && _restoreFailed;

  /// Retries a failed restore (on app resume and from "Try again").
  Future<void> retryRestore() async {
    if (canRetryRestore) await restore();
  }

  /// Reads the stored refresh token. An unreadable store (e.g. a Keystore key
  /// lost after a backup restore) is cleared and treated as signed out.
  Future<String?> _readStored() async {
    try {
      return await _store.read();
    } on Object catch (error) {
      debugPrint('Couldn’t read the saved sign-in: $error');
      await _clearStored();
      return null;
    }
  }

  Future<void> _clearStored() async {
    try {
      await _store.clear();
    } on Object catch (error) {
      debugPrint('Couldn’t clear the saved sign-in: $error');
    }
  }

  /// Starts a new session generation: anything in flight is now stale.
  int _nextGeneration() {
    _generation++;
    _refreshing = null;
    _timer?.cancel();
    _restoreFailed = false;
    return _generation;
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
    final generation = _nextGeneration();
    _message = null;
    _resetJoin();
    _set(AuthStatus.signingIn);
    String? idToken;
    try {
      idToken = await google.idToken();
      if (generation != _generation) return;
      if (idToken == null) return _set(AuthStatus.signedOut);
      await _accept(await api.signInWithGoogle(idToken), generation);
    } on ApiException catch (error) {
      if (generation != _generation) return;
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
      if (generation != _generation) return;
      _message =
          'Sign-in didn’t complete. Check your connection and try again.';
      _set(AuthStatus.failed);
    }
  }

  Future<void> signInWithApple() async {
    final api = _api, apple = _apple;
    if (api == null || apple == null) return;
    final generation = _nextGeneration();
    _message = null;
    _resetJoin();
    _set(AuthStatus.signingIn);
    AppleCredential? credential;
    try {
      credential = await apple.credential();
      if (generation != _generation) return;
      if (credential == null) return _set(AuthStatus.signedOut);
      await _accept(
        await api.signInWithApple(
          identityToken: credential.identityToken,
          rawNonce: credential.rawNonce,
          fullName: credential.fullName,
        ),
        generation,
      );
    } on ApiException catch (error) {
      if (generation != _generation) return;
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
      if (generation != _generation) return;
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
    final current = _session?.refreshToken;
    _endSession();
    final token = current ?? await _readStored();
    await _clearStored();
    _set(enabled ? AuthStatus.signedOut : AuthStatus.disabled);
    if (api != null && token != null) {
      unawaited(api.logout(token).catchError((Object _) {}));
    }
    unawaited(_google?.signOut().catchError((Object _) {}));
  }

  /// Drops the in-memory session and starts a new generation (synchronously,
  /// before any await, so in-flight work sees it).
  void _endSession() {
    _nextGeneration();
    _session = null;
    _refreshDue = null;
    _message = null;
    _resetJoin();
  }

  /// Deletes the signed-in account (`DELETE /v1/me`). An Apple account first
  /// re-authorizes with Apple so the server can revoke Apple's tokens; if the
  /// person cancels that, the account is still deleted without the code.
  Future<DeleteAccountResult> deleteAccount(MemberRepository members) async {
    final user = _session?.user;
    if (!signedIn || user == null) return DeleteAccountResult.sessionEnded;
    final generation = _generation;
    String? appleCode;
    final apple = _apple;
    // An Apple account, or a Google one with Apple linked: re-authorize so
    // the server can revoke Apple's tokens.
    var hasApple = user.subject.startsWith('apple|');
    if (!hasApple && apple != null && apple.supported) {
      try {
        hasApple = (await members.identities()).contains('apple');
      } on Object catch (_) {}
    }
    if (hasApple && apple != null && apple.supported) {
      try {
        appleCode = (await apple.credential())?.authorizationCode;
      } on Object catch (error) {
        debugPrint('Apple re-authorization for deletion failed: $error');
      }
    }
    if (generation != _generation) return DeleteAccountResult.sessionEnded;
    try {
      await members.deleteAccount(appleAuthorizationCode: appleCode);
    } on ApiException catch (error) {
      if (error.statusCode == 409 && error.error == 'last_admin') {
        return DeleteAccountResult.lastAdmin;
      }
      if (error.statusCode == 401) {
        await _endLocally('Your session ended. Sign in again.');
        return DeleteAccountResult.sessionEnded;
      }
      return DeleteAccountResult.failed;
    } on Exception {
      return DeleteAccountResult.failed;
    }
    await _endLocally(null);
    return DeleteAccountResult.deleted;
  }

  /// Links an Apple account to the signed-in member
  /// (`POST /v1/me/identities/apple`), so Sign in with Apple opens this
  /// account, including with "Hide My Email".
  Future<LinkAppleResult> linkApple(MemberRepository members) async {
    final apple = _apple;
    if (!signedIn || apple == null || !apple.supported) {
      return LinkAppleResult.unavailable;
    }
    final generation = _generation;
    AppleCredential? credential;
    try {
      credential = await apple.credential();
    } on Object catch (error) {
      debugPrint('Apple authorization for linking failed: $error');
      return LinkAppleResult.failed;
    }
    if (credential == null) return LinkAppleResult.cancelled;
    if (generation != _generation) return LinkAppleResult.sessionEnded;
    try {
      await members.linkApple(
        identityToken: credential.identityToken,
        rawNonce: credential.rawNonce,
      );
      return LinkAppleResult.linked;
    } on ApiException catch (error) {
      if (error.statusCode == 409) return LinkAppleResult.linkedElsewhere;
      return LinkAppleResult.failed;
    } on Exception {
      return LinkAppleResult.failed;
    }
  }

  /// Ends the session on this device only (the server already ended it).
  Future<void> _endLocally(String? message) async {
    _endSession();
    _message = message;
    await _clearStored();
    _set(AuthStatus.signedOut);
    unawaited(_google?.signOut().catchError((Object _) {}));
  }

  @override
  Future<String?> accessToken() async {
    final session = _session, due = _refreshDue;
    if (session == null) return (await _refreshing)?.accessToken;
    if (due != null && _now().isBefore(due)) return session.accessToken;
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

  /// Single-flight refresh. A new generation drops the shared future, so
  /// callers after a sign-out or sign-in never join a stale refresh.
  Future<AuthSession?> _refresh() {
    final existing = _refreshing;
    if (existing != null) return existing;
    late final Future<AuthSession?> future;
    future = _doRefresh().whenComplete(() {
      if (identical(_refreshing, future)) _refreshing = null;
    });
    return _refreshing = future;
  }

  Future<AuthSession?> _doRefresh() async {
    final api = _api;
    final generation = _generation;
    // The newest refresh token: the in-memory session's, which is persisted
    // before it is set (see [_accept]), or the stored one.
    final token = _session?.refreshToken ?? await _readStored();
    if (generation != _generation) return null;
    if (api == null || token == null) {
      _session = null;
      _set(enabled ? AuthStatus.signedOut : AuthStatus.disabled);
      return null;
    }
    try {
      final session = await api.refresh(token);
      if (generation != _generation) {
        // Signed out (or in again) meanwhile: don't resurrect this session,
        // and revoke the token the server just issued.
        unawaited(api.logout(session.refreshToken).catchError((Object _) {}));
        return null;
      }
      return await _accept(session, generation) ? session : null;
    } on ApiException catch (error) {
      if (generation != _generation) return null;
      if (error.statusCode == 401 || error.statusCode == 403) {
        _timer?.cancel();
        _session = null;
        _refreshDue = null;
        _restoreFailed = false;
        await _clearStored();
        _message = error.notInvited
            ? 'Your club invitation is no longer active.'
            : 'Your session ended. Sign in again.';
        _set(error.notInvited ? AuthStatus.notInvited : AuthStatus.signedOut);
        return null;
      }
      return _keepAfterTransientFailure();
    } on Exception {
      if (generation != _generation) return null;
      return _keepAfterTransientFailure();
    }
  }

  /// Network trouble: keep the saved refresh token so a retry can succeed.
  AuthSession? _keepAfterTransientFailure() {
    if (_session == null) {
      _restoreFailed = true;
      _message = 'Couldn’t reach the club server to restore your sign-in.';
      _set(AuthStatus.failed);
    }
    return null;
  }

  /// Takes a new session unless [generation] is stale. The refresh token is
  /// persisted before the session is used, so the newest token is always the
  /// one stored (the API's rotation grace window relies on that).
  Future<bool> _accept(AuthSession session, int generation) async {
    if (generation != _generation) return false;
    final receivedAt = _now();
    try {
      await _store.write(session.refreshToken);
    } on Object catch (error) {
      // Still usable for this launch; the next launch asks to sign in.
      debugPrint('Couldn’t save the sign-in: $error');
    }
    if (generation != _generation) return false;
    _session = session;
    _refreshDue = receivedAt.add(_refreshAfter(session));
    _message = null;
    _restoreFailed = false;
    _resetJoin();
    _schedule();
    _set(AuthStatus.signedIn);
    return true;
  }

  /// How long after receiving [session] to refresh it: its lifetime on the
  /// server's clock minus [refreshLeeway], never less than [minRefreshDelay].
  /// Measured from the local receive time, so device clock skew doesn't
  /// matter.
  Duration _refreshAfter(AuthSession session) {
    final wait = session.lifetime - refreshLeeway;
    return wait < minRefreshDelay ? minRefreshDelay : wait;
  }

  void _schedule() {
    _timer?.cancel();
    final due = _refreshDue;
    if (due == null) return;
    var wait = due.difference(_now());
    if (wait < minRefreshDelay) wait = minRefreshDelay;
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

/// Outcome of [AuthService.deleteAccount].
/// Outcome of [AuthService.linkApple].
enum LinkAppleResult {
  linked,

  /// The person closed the Apple sheet.
  cancelled,

  /// 409: that Apple account already belongs to another member.
  linkedElsewhere,
  sessionEnded,
  failed,

  /// Not signed in, or Sign in with Apple isn't available (not iOS).
  unavailable,
}

enum DeleteAccountResult {
  deleted,

  /// 409 `last_admin`: the only admin can't delete their account.
  lastAdmin,

  /// 401: not signed in any more (now signed out).
  sessionEnded,
  failed,
}
