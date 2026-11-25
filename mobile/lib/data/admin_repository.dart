import 'package:http/http.dart' as http;

import 'api_client.dart';
import 'models/account.dart';
import 'models/admin.dart';
import 'models/availability.dart';

export 'models/account.dart';
export 'models/admin.dart';
export 'models/availability.dart';

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
  /// `POST /v1/admin/dues` (one player) or `/v1/admin/dues/all-members`
  /// (everyone who has signed in; coaches are left out by the API).
  Future<AssignAllResult> assignDues(NewDues dues) async {
    if (dues.playerSubject != null) {
      await _api.postJson('/v1/admin/dues', dues.toJson(), auth: true);
      return const AssignAllResult(created: 1);
    }
    return AssignAllResult.fromJson(
      await _api.postJson(
        '/v1/admin/dues/all-members',
        dues.toJson(),
        auth: true,
      ) as Map<String, dynamic>?,
    );
  }

  /// `GET /v1/admin/dues/automatic`.
  Future<AutomaticDues> automaticDues() async => AutomaticDues.fromJson(
    await _api.getJson('/v1/admin/dues/automatic', auth: true)
        as Map<String, dynamic>,
  );

  /// `PUT /v1/admin/dues/automatic`.
  Future<void> saveAutomaticDues(AutomaticDues setting) async {
    await _api.putJson(
      '/v1/admin/dues/automatic',
      setting.toJson(),
      auth: true,
    );
  }

  /// `DELETE /v1/admin/dues/{id}`: only for dues with nothing paid and no
  /// card checkout in progress (409 otherwise).
  Future<void> removeDues(String id) async {
    await _api.deleteJson('/v1/admin/dues/${_id(id)}', auth: true);
  }

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

  /// `PUT /v1/admin/members/{subject}/name` with `{name}` ("First Last").
  /// Throws [ApiException]: 400 `{error}` when the name is invalid, 404 when
  /// the member no longer exists.
  Future<void> setMemberName(String subject, String name) async {
    await _api.putJson('/v1/admin/members/${_id(subject)}/name', {
      'name': name,
    }, auth: true);
  }

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

  /// `GET /v1/admin/invite-links`: active and expired or turned-off links.
  Future<List<InviteLink>> inviteLinks() async => _list(
    await _api.getJson('/v1/admin/invite-links', auth: true),
    InviteLink.fromJson,
  );

  /// `POST /v1/admin/invite-links` with `{expiresInDays}`.
  Future<InviteLink> createInviteLink(int days) async => InviteLink.fromJson(
    await _api.postJson('/v1/admin/invite-links', {
      'expiresInDays': days,
    }, auth: true) as Map<String, dynamic>,
  );

  /// `DELETE /v1/admin/invite-links/{id}`: turns the link off. People who
  /// already joined keep their access.
  Future<void> revokeInviteLink(String id) async {
    await _api.deleteJson('/v1/admin/invite-links/${_id(id)}', auth: true);
  }

  /// `GET /v1/admin/invitations`: every invited email and its role.
  Future<List<ClubInvitation>> invitations() async => _list(
    await _api.getJson('/v1/admin/invitations', auth: true),
    ClubInvitation.fromJson,
  );

  /// `DELETE /v1/admin/invitations/{email}`. 403 for an admin or coach unless
  /// you're the super admin; 409 for yourself.
  Future<void> removeInvitation(String email) async {
    await _api.deleteJson(
      '/v1/admin/invitations/${_id(email.toLowerCase())}',
      auth: true,
    );
  }

  /// Invites [email] (or changes an invited email's role): the same call as
  /// [setMemberRole].
  Future<void> invite(String email, {String role = 'player'}) =>
      setMemberRole(email, role);

  /// `PUT /v1/admin/invitations/{email}` with `{role}` (`player`, `coach` or
  /// `admin`). Only the super admin may give or take away coach and admin
  /// (403 otherwise); 409 for your own role or the super admin's.
  Future<void> setMemberRole(String email, String role) async {
    await _api.putJson('/v1/admin/invitations/${_id(email.toLowerCase())}', {
      'role': role,
    }, auth: true);
  }

  /// Invites the request's email with [role] (`player`, `coach` or `admin`). Throws
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

  /// `GET /v1/admin/fixtures/{id}/availability`: every member's answer.
  Future<AdminAvailability> matchAvailability(String fixtureId) async =>
      AdminAvailability.fromJson(
        await _api.getJson(
          '/v1/admin/fixtures/${_id(fixtureId)}/availability',
          auth: true,
        ) as Map<String, dynamic>,
      );

  /// `GET /v1/admin/fixtures/{id}/lineup`: the draft or published lineup.
  Future<Lineup> lineup(String fixtureId) async => Lineup.fromJson(
    await _api.getJson(
      '/v1/admin/fixtures/${_id(fixtureId)}/lineup',
      auth: true,
    ) as Map<String, dynamic>,
  );

  /// `PUT /v1/admin/fixtures/{id}/lineup`: replaces the lineup with [slots]
  /// (number → member subject) as a draft, or publishes it (the selected
  /// players get a notification the first time). Throws [ApiException] 400
  /// `{error}` for duplicates or non-members.
  Future<Lineup> saveLineup(
    String fixtureId,
    Map<int, String> slots, {
    required bool publish,
  }) async {
    final numbers = slots.keys.toList()..sort();
    return Lineup.fromJson(
      await _api.putJson('/v1/admin/fixtures/${_id(fixtureId)}/lineup', {
        'slots': [
          for (final number in numbers)
            {'number': number, 'subject': slots[number]},
        ],
        'publish': publish,
      }, auth: true) as Map<String, dynamic>,
    );
  }
}
