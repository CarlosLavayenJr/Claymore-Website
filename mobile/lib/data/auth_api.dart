import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'api_client.dart';
import 'models/account.dart';
import 'models/join.dart';

export 'models/join.dart';

/// The mobile auth endpoints. These calls never carry a bearer token, so they
/// use an [ApiClient] without a token source.
class AuthApi {
  AuthApi(ApiBase base, {http.Client? client})
    : _api = ApiClient(base: base, client: client);

  final ApiClient _api;

  /// Exchanges a Google ID token. 401: invalid token. 403 `not_invited`.
  Future<AuthSession> signInWithGoogle(String idToken) =>
      _session('/v1/auth/mobile/google', {'idToken': idToken});

  /// Exchanges an Apple identity token. [rawNonce] is the value whose SHA-256
  /// was sent to Apple; [fullName] only arrives on the first authorization.
  /// 401: invalid token or nonce. 403 `not_invited`, with `email` for a
  /// private relay address.
  Future<AuthSession> signInWithApple({
    required String identityToken,
    required String rawNonce,
    String? fullName,
  }) => _session('/v1/auth/mobile/apple', {
    'identityToken': identityToken,
    'rawNonce': rawNonce,
    if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
  });

  /// Rotates the refresh token. 401/403 end the session.
  Future<AuthSession> refresh(String refreshToken) =>
      _session('/v1/auth/mobile/refresh', {'refreshToken': refreshToken});

  Future<void> logout(String refreshToken) async {
    await _api.send(
      'POST',
      '/v1/auth/mobile/logout',
      body: {'refreshToken': refreshToken},
    );
  }

  /// Asks the club to let this Google account join. [phone] and [message]
  /// are sent only when non-empty.
  Future<JoinReply> requestAccessWithGoogle({
    required String idToken,
    required String name,
    String? phone,
    String? message,
  }) => _requestAccess('/v1/auth/mobile/google/request-access', {
    'idToken': idToken,
    ..._joinFields(name, phone, message),
  });

  /// As [requestAccessWithGoogle] for Apple. [rawNonce] must be fresh: one
  /// Apple authorization per request.
  Future<JoinReply> requestAccessWithApple({
    required String identityToken,
    required String rawNonce,
    required String name,
    String? phone,
    String? message,
  }) => _requestAccess('/v1/auth/mobile/apple/request-access', {
    'identityToken': identityToken,
    'rawNonce': rawNonce,
    ..._joinFields(name, phone, message),
  });

  /// Where this Google account's join request stands. 401: invalid token.
  Future<JoinRequestStatus> requestStatusWithGoogle(String idToken) =>
      _requestStatus('/v1/auth/mobile/google/request-status', {
        'idToken': idToken,
      });

  Future<JoinRequestStatus> requestStatusWithApple({
    required String identityToken,
    required String rawNonce,
  }) => _requestStatus('/v1/auth/mobile/apple/request-status', {
    'identityToken': identityToken,
    'rawNonce': rawNonce,
  });

  static Map<String, String> _joinFields(
    String name,
    String? phone,
    String? message,
  ) => {
    'name': name.trim(),
    if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
    if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
  };

  Future<JoinReply> _requestAccess(
    String path,
    Map<String, String> body,
  ) async {
    final response = await _api.send('POST', path, body: body);
    final json = _object(response);
    String? text(String key) =>
        json[key] is String ? json[key] as String : null;
    return switch (response.statusCode) {
      202 || 200 => JoinReply(JoinReplyKind.pending, email: text('email')),
      409 => const JoinReply(JoinReplyKind.alreadyMember),
      429 when text('status') == 'denied_recently' => const JoinReply(
        JoinReplyKind.deniedRecently,
      ),
      400 => JoinReply(JoinReplyKind.invalid, field: text('field')),
      401 => const JoinReply(JoinReplyKind.invalidToken),
      _ => throw ApiException.fromResponse(response),
    };
  }

  Future<JoinRequestStatus> _requestStatus(
    String path,
    Map<String, String> body,
  ) async {
    final response = await _api.send('POST', path, body: body);
    if (response.statusCode != 200) throw ApiException.fromResponse(response);
    return JoinRequestStatus.parse(_object(response)['status']);
  }

  static Map<String, dynamic> _object(http.Response response) {
    try {
      final json = jsonDecode(utf8.decode(response.bodyBytes));
      return json is Map<String, dynamic> ? json : const {};
    } on FormatException {
      return const {};
    }
  }

  Future<AuthSession> _session(String path, Map<String, String> body) async {
    final response = await _api.send('POST', path, body: body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.fromResponse(response);
    }
    final json = _object(response);
    try {
      return AuthSession.fromJson(
        json,
        serverDate: parseHttpDate(response.headers['date']),
      );
    } on Object {
      throw const ApiException(502);
    }
  }
}

extension ApiExceptionAuth on ApiException {
  bool get notInvited => statusCode == 403 && error == 'not_invited';
}
