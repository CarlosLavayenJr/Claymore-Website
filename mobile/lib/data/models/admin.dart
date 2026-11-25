// Admin shapes from the Claymores API (`/v1/admin/...`, camelCase JSON).

import 'dart:math';

String? _opt(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

/// A member who has signed in at least once (`GET /v1/admin/members`).
class ClubMember {
  const ClubMember({
    required this.subject,
    required this.email,
    this.name,
    this.role,
  });

  ClubMember.fromJson(Map<String, dynamic> json)
    : subject = json['subject'] as String,
      email = json['email'] as String? ?? '',
      name = _opt(json['name']),
      role = _opt(json['role']);

  final String subject, email;
  final String? name;

  /// `superadmin`, `coach`, `admin` or `player` (older APIs leave it out).
  final String? role;

  /// The role badge: SUPER ADMIN, COACH, ADMIN or PLAYER (null when an
  /// older API leaves the role out).
  String? get roleBadge => switch (role) {
    'superadmin' => 'SUPER ADMIN',
    'coach' => 'COACH',
    'admin' => 'ADMIN',
    'player' => 'PLAYER',
    _ => null,
  };

  bool get isStaff =>
      role == 'superadmin' || role == 'coach' || role == 'admin';

  /// "Name", or the email when the member has no name.
  String get label => name ?? (email.isEmpty ? 'Club member' : email);
}

/// A request to join (`GET /v1/admin/join-requests`). The API sends
/// `{id, provider, email, name, phone, message, status, createdAt,
/// updatedAt}`; optional fields are read defensively, as the website does.
class AdminJoinRequest {
  AdminJoinRequest.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      provider = _opt(json['provider']),
      email = json['email'] as String? ?? '',
      name = _opt(json['name']),
      phone = _opt(json['phone']),
      message = _opt(json['message']),
      status = _opt(json['status']) ?? 'pending',
      createdAt = DateTime.tryParse(
        (json['createdAt'] ?? json['requestedAt']) as String? ?? '',
      );

  final String id, email, status;

  /// `google` or `apple`.
  final String? provider;
  final String? name, phone, message;
  final DateTime? createdAt;

  String get label => name ?? email;
}

/// How an admin can record a payment by hand (everything except Stripe).
/// [volunteer] and [waived] are credits, not money, and need a note.
enum ManualPaymentMethod {
  cash('Cash'),
  venmo('Venmo'),
  zelle('Zelle'),
  check('Check'),
  other('Other'),
  volunteer(
    'Volunteered',
    credit: true,
    noteHint: 'What did they do? e.g. Reffed U12 game',
  ),
  waived('Waived', credit: true, noteHint: 'Why? e.g. Scholarship, injury');

  const ManualPaymentMethod(this.label, {this.credit = false, this.noteHint});
  final String label;

  /// Time or work for the club, or forgiven: not money. The API requires a
  /// note for these.
  final bool credit;

  /// Placeholder for the note when it's required.
  final String? noteHint;

  bool get requiresNote => credit;

  static Iterable<ManualPaymentMethod> get money =>
      values.where((m) => !m.credit);
  static Iterable<ManualPaymentMethod> get credits =>
      values.where((m) => m.credit);
}

/// What the admin typed into the "Record payment" sheet.
class PaymentDraft {
  const PaymentDraft({
    required this.amountCents,
    required this.method,
    this.note,
  });

  final int amountCents;
  final ManualPaymentMethod method;
  final String? note;

  @override
  bool operator ==(Object other) =>
      other is PaymentDraft &&
      other.amountCents == amountCents &&
      other.method == method &&
      other.note == note;

  @override
  int get hashCode => Object.hash(amountCents, method, note);
}

/// Body of `POST /v1/admin/dues/{id}/payments`. [id] is the idempotency key:
/// the same id and body after a network error records the payment once.
class NewDuesPayment {
  const NewDuesPayment({required this.id, required this.draft});

  final String id;
  final PaymentDraft draft;

  Map<String, Object> toJson() => {
    'id': id,
    'amountCents': draft.amountCents,
    'method': draft.method.name,
    if (draft.note != null) 'note': draft.note!,
  };
}

/// Hands out payment ids: a fresh one per new payment, the same one when the
/// admin retries an identical payment after the request may have reached the
/// server (a network error or 5xx).
class PaymentIdempotency {
  PaymentIdempotency({String Function()? newId}) : _newId = newId ?? uuidV4;

  final String Function() _newId;
  String? _id;
  PaymentDraft? _draft;

  NewDuesPayment payment(PaymentDraft draft) {
    if (_id == null || _draft != draft) {
      _id = _newId();
      _draft = draft;
    }
    return NewDuesPayment(id: _id!, draft: draft);
  }

  /// The server answered for sure (success or a 4xx): the next payment is a
  /// new one.
  void settled() {
    _id = null;
    _draft = null;
  }
}

/// A random (version 4) UUID, e.g. `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed`.
String uuidV4([Random? random]) {
  final r = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => r.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
