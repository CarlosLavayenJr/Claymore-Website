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
}
