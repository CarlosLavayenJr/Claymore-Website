import 'api_client.dart';
import 'models/account.dart';
import 'models/availability.dart';

export 'models/account.dart';
export 'models/availability.dart';

/// Signed-in member calls: identity, dues and Stripe checkout, match
/// availability and lineups, and push devices.
class MemberRepository {
  MemberRepository(this._api);

  final ApiClient _api;

  Future<AuthUser> me() async => AuthUser.fromJson(
    await _api.getJson('/v1/me', auth: true) as Map<String, dynamic>,
  );

  /// `PUT /v1/me/name`: the member's own name as the club shows it ("First
  /// Last"); sign-in won't replace it afterwards. Returns the stored name.
  /// Throws [ApiException] 400 (with the API's message) when blank or over
  /// 80 characters.
  Future<String> setName(String name) async {
    final json = await _api.putJson('/v1/me/name', {'name': name}, auth: true);
    final saved = json is Map ? json['name'] : null;
    return saved is String && saved.trim().isNotEmpty ? saved : name;
  }

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

  static String _id(String id) => Uri.encodeComponent(id);

  /// `GET /v1/availability/mine`: my answers for upcoming matches.
  Future<List<AvailabilityAnswer>> myAvailability() async =>
      (await _api.getJson('/v1/availability/mine', auth: true) as List? ??
              const [])
          .whereType<Map<String, dynamic>>()
          .map(AvailabilityAnswer.fromJson)
          .toList(growable: false);

  /// `GET /v1/fixtures/{id}/availability`. Throws [ApiException] 404 for an
  /// unknown match.
  Future<MyAvailability> availability(String fixtureId) async =>
      MyAvailability.fromJson(
        await _api.getJson(
          '/v1/fixtures/${_id(fixtureId)}/availability',
          auth: true,
        ) as Map<String, dynamic>,
      );

  /// `PUT /v1/fixtures/{id}/availability`. Throws [ApiException]: 400 for an
  /// invalid answer (note over 200 characters), 409 once the match is played.
  Future<MyAvailability> answerAvailability(
    String fixtureId,
    AvailabilityStatus status, {
    String? note,
  }) async {
    final text = note?.trim() ?? '';
    return MyAvailability.fromJson(
      await _api.putJson('/v1/fixtures/${_id(fixtureId)}/availability', {
        'status': status.api,
        'note': text.isEmpty ? null : text,
      }, auth: true) as Map<String, dynamic>,
    );
  }

  /// `GET /v1/fixtures/{id}/lineup`: status `none` until it's published.
  Future<Lineup> lineup(String fixtureId) async => Lineup.fromJson(
    await _api.getJson('/v1/fixtures/${_id(fixtureId)}/lineup', auth: true)
        as Map<String, dynamic>,
  );

  /// `POST /v1/me/devices` (204): this device's push token, for match
  /// reminders and lineup notices. [platform] is `ios` or `android`.
  Future<void> registerDevice(String token, String platform) => _api.postJson(
    '/v1/me/devices',
    {'token': token, 'platform': platform},
    auth: true,
  );

  /// `POST /v1/me/devices/remove` (204): stop pushing to this device.
  Future<void> removeDevice(String token) =>
      _api.postJson('/v1/me/devices/remove', {'token': token}, auth: true);
}
