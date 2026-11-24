import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'api_client.dart';
import 'models/account.dart';

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

  Future<AuthSession> _session(String path, Map<String, String> body) async {
    final json = await _api.postJson(path, body);
    if (json is! Map<String, dynamic>) throw const ApiException(502);
    return AuthSession.fromJson(json);
  }
}

extension ApiExceptionAuth on ApiException {
  bool get notInvited => statusCode == 403 && error == 'not_invited';
}
