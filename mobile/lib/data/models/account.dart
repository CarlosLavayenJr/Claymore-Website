// Auth and dues shapes from the Claymores API (ASP.NET, camelCase JSON).

String? _opt(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;
int _cents(Object? value) => value is num ? value.toInt() : 0;

class AuthUser {
  const AuthUser({required this.subject, this.name, this.email, this.role});

  AuthUser.fromJson(Map<String, dynamic> json)
    : subject = json['subject'] as String,
      name = _opt(json['name']),
      email = _opt(json['email']),
      role = _opt(json['role']);

  final String subject;
  final String? name, email, role;

  String get displayName => name ?? email ?? 'Club member';
}

/// Response of `POST /v1/auth/mobile/google` and `/refresh`.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.user,
  });

  AuthSession.fromJson(Map<String, dynamic> json)
    : accessToken = json['accessToken'] as String,
      accessTokenExpiresAt = DateTime.parse(
        json['accessTokenExpiresAt'] as String,
      ),
      refreshToken = json['refreshToken'] as String,
      user = AuthUser.fromJson(json['user'] as Map<String, dynamic>);

  final String accessToken, refreshToken;
  final DateTime accessTokenExpiresAt;
  final AuthUser user;
}

/// `DuesAssessment` in api/src/Claymores.Api/DuesLedger.cs.
class DuesAssessment {
  DuesAssessment.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      playerSubject = json['playerSubject'] as String? ?? '',
      description = json['description'] as String? ?? 'Dues',
      amountCents = _cents(json['amountCents']),
      dueDate = json['dueDate'] is String
          ? DateTime.tryParse(json['dueDate'] as String)
          : null,
      paidCents = _cents(json['paidCents']),
      balanceCents = _cents(json['balanceCents']),
      pendingCheckoutCents = _cents(json['pendingCheckoutCents']);

  final String id, playerSubject, description;
  final int amountCents, paidCents, balanceCents, pendingCheckoutCents;
  final DateTime? dueDate;

  bool get hasPendingCheckout => pendingCheckoutCents > 0;
  bool get settled => balanceCents <= 0;
}

class DuesPayment {
  DuesPayment.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      amountCents = _cents(json['amountCents']),
      recordedAt = DateTime.tryParse(json['recordedAt'] as String? ?? '');

  final String id;
  final int amountCents;
  final DateTime? recordedAt;
}

/// `DuesDetail` = `{assessment, payments}`.
class DuesDetail {
  DuesDetail.fromJson(Map<String, dynamic> json)
    : assessment = DuesAssessment.fromJson(
        json['assessment'] as Map<String, dynamic>,
      ),
      payments = (json['payments'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(DuesPayment.fromJson)
          .toList(growable: false);

  final DuesAssessment assessment;
  final List<DuesPayment> payments;
}
