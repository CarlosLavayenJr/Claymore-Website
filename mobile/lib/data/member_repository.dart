import 'api_client.dart';
import 'models/account.dart';

export 'models/account.dart';

/// Signed-in member calls: identity, dues and Stripe checkout.
class MemberRepository {
  MemberRepository(this._api);

  final ApiClient _api;

  Future<AuthUser> me() async => AuthUser.fromJson(
    await _api.getJson('/v1/me', auth: true) as Map<String, dynamic>,
  );

  Future<List<DuesAssessment>> myDues() async =>
      (await _api.getJson('/v1/dues/mine', auth: true) as List)
          .whereType<Map<String, dynamic>>()
          .map(DuesAssessment.fromJson)
          .toList(growable: false);

  Future<DuesDetail> duesDetail(String id) async => DuesDetail.fromJson(
    await _api.getJson('/v1/dues/mine/${Uri.encodeComponent(id)}', auth: true)
        as Map<String, dynamic>,
  );

  /// Starts (or resumes, when [amountCents] equals the pending amount) a
  /// Stripe Checkout session. Returns the hosted checkout URL.
  Future<Uri> startCheckout(String id, int amountCents) async {
    final json = await _api.postJson(
      '/v1/dues/${Uri.encodeComponent(id)}/checkout-session',
      {'amountCents': amountCents},
      auth: true,
    );
    final url = json is Map ? Uri.tryParse('${json['url']}') : null;
    if (url == null || url.scheme != 'https') throw const ApiException(502);
    return url;
  }

  /// `GET /v1/me/identities`: which sign-ins open this account
  /// (`google`, `apple`).
  Future<Set<String>> identities() async =>
      _providers(await _api.getJson('/v1/me/identities', auth: true));

  /// `POST /v1/me/identities/apple`: links an Apple account, so Sign in with
  /// Apple opens this account even with "Hide My Email". Returns the linked
  /// sign-ins. Throws [ApiException]: 409 `linked_elsewhere` when that Apple
  /// account belongs to another member, 401 for a rejected Apple token.
  Future<Set<String>> linkApple({
    required String identityToken,
    required String rawNonce,
  }) async => _providers(
    await _api.postJson('/v1/me/identities/apple', {
      'identityToken': identityToken,
      'rawNonce': rawNonce,
    }, auth: true),
  );

  static Set<String> _providers(Object? json) => {
    if (json is Map && json['providers'] is List)
      for (final p in json['providers'] as List)
        if (p is String) p,
  };

  /// `DELETE /v1/me`: deletes the signed-in account (204). For an Apple
  /// account, [appleAuthorizationCode] lets the server revoke Apple's tokens.
  /// Throws [ApiException]: 409 `last_admin`, 401 when not signed in.
  Future<void> deleteAccount({String? appleAuthorizationCode}) async {
    final response = await _api.send(
      'DELETE',
      '/v1/me',
      body: appleAuthorizationCode == null
          ? null
          : {'appleAuthorizationCode': appleAuthorizationCode},
      auth: true,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.fromResponse(response);
    }
  }
}
