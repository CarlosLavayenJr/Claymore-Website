import 'package:http/http.dart' as http;

import 'api_client.dart';
import 'models/account.dart';
import 'models/admin.dart';

export 'models/account.dart';
export 'models/admin.dart';

/// Club admin calls: every member's dues, recording payments by hand, and
/// join requests. All need an admin's bearer token (403 otherwise).
class AdminRepository {
  AdminRepository(this._api);

  final ApiClient _api;

  static String _id(String id) => Uri.encodeComponent(id);

  static List<T> _list<T>(
    Object? json,
    T Function(Map<String, dynamic>) parse,
  ) => (json as List? ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(parse)
      .toList(growable: false);

  /// `GET /v1/admin/dues`: every assessment in the club. Throws
  /// [ApiException] 404 when dues are switched off in the API.
  Future<List<DuesAssessment>> allDues() async => _list(
    await _api.getJson('/v1/admin/dues', auth: true),
    DuesAssessment.fromJson,
  );

  /// `GET /v1/admin/dues/{id}`: one assessment and its payments.
  Future<DuesDetail> duesDetail(String id) async => DuesDetail.fromJson(
    await _api.getJson('/v1/admin/dues/${_id(id)}', auth: true)
        as Map<String, dynamic>,
  );

  /// `POST /v1/admin/dues/{id}/payments`. Idempotent on [payment]'s id.
  /// Throws [ApiException]: 409 `{error}` when it exceeds the balance,
  /// 400 `{error}` when invalid.
  Future<void> recordPayment(String assessmentId, NewDuesPayment payment) =>
      _api.postJson(
        '/v1/admin/dues/${_id(assessmentId)}/payments',
        payment.toJson(),
        auth: true,
      );

  /// `PATCH /v1/admin/dues/{id}/payments/{paymentId}` with `{note}` (204).
  /// Throws [ApiException]: 400 when the note is too long or a volunteer or
  /// waived credit would be left without one, 409 when the payment was
  /// undone.
  Future<void> editPaymentNote(
    String assessmentId,
    String paymentId,
    String note,
  ) => _expectSuccess(
    _api.send(
      'PATCH',
      '/v1/admin/dues/${_id(assessmentId)}/payments/${_id(paymentId)}',
      body: {'note': note},
      auth: true,
    ),
  );

  /// `POST /v1/admin/dues/{id}/payments/{paymentId}/void` with `{reason}`
  /// (204). The payment stays in the history, crossed out, and the balance
  /// goes back up. Card payments still need a refund in Stripe. Throws
  /// [ApiException]: 400 without a reason, 409 when already undone.
  Future<void> voidPayment(
    String assessmentId,
    String paymentId,
    String reason,
  ) => _api.postJson(
    '/v1/admin/dues/${_id(assessmentId)}/payments/${_id(paymentId)}/void',
    {'reason': reason},
    auth: true,
  );

  static Future<void> _expectSuccess(Future<http.Response> request) async {
    final response = await request;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.fromResponse(response);
    }
  }

  /// `GET /v1/admin/members`: members who have signed in at least once.
  Future<List<ClubMember>> members() async => _list(
    await _api.getJson('/v1/admin/members', auth: true),
    ClubMember.fromJson,
  );

  /// `GET /v1/admin/join-requests?status=`: `pending`, `approved` or
  /// `denied`.
  Future<List<AdminJoinRequest>> joinRequests({
    String status = 'pending',
  }) async => _list(
    await _api.getJson(
      '/v1/admin/join-requests',
      query: {'status': status},
      auth: true,
    ),
    AdminJoinRequest.fromJson,
  );

  /// Invites the request's email with [role] (`player` or `admin`). Throws
  /// [ApiException] 409 `not_pending` when it was already decided.
  Future<void> approveJoinRequest(String id, {String role = 'player'}) =>
      _api.postJson('/v1/admin/join-requests/${_id(id)}/approve', {
        'role': role,
      }, auth: true);

  /// Denies the request, with an optional [reason] (up to 500 characters).
  Future<void> denyJoinRequest(String id, {String? reason}) {
    final text = reason?.trim() ?? '';
    return _api.postJson('/v1/admin/join-requests/${_id(id)}/deny', {
      if (text.isNotEmpty) 'reason': text,
    }, auth: true);
  }
}
