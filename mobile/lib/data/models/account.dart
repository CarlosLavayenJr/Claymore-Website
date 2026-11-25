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

  /// This member with [name] in place of the current one.
  AuthUser withName(String name) =>
      AuthUser(subject: subject, name: name, email: email, role: role);

  /// Google sometimes sends only a first name and Apple sends it once, so
  /// the Club tab asks for a full name when this is true.
  bool get needsFullName => needsFullMemberName(name);
}

// Member names, as in the website's lib/claymores/member-name.ts: the club
// stores "First Last", at most [maxMemberNameLength] characters.

const maxMemberNameLength = 80;

String _cleanName(String? value) =>
    (value ?? '').trim().split(RegExp(r'\s+')).join(' ');

/// True when there's no name, only one word, or an email address.
bool needsFullMemberName(String? name) {
  final n = _cleanName(name);
  return n.isEmpty || !n.contains(' ') || n.contains('@');
}

/// "Anthony Rossi" → ("Anthony", "Rossi"): the first word, then the rest.
/// An email address prefills nothing.
({String first, String last}) splitMemberName(String? name) {
  final n = _cleanName(name);
  if (n.isEmpty || n.contains('@')) return (first: '', last: '');
  final i = n.indexOf(' ');
  return i < 0
      ? (first: n, last: '')
      : (first: n.substring(0, i), last: n.substring(i + 1));
}

/// Joins the form's parts as "First Last", or returns the problem to show.
({String? name, String? error}) joinMemberName(String first, String last) {
  final f = _cleanName(first), l = _cleanName(last);
  if (f.isEmpty || l.isEmpty) {
    return (name: null, error: 'Enter both a first and a last name.');
  }
  final name = '$f $l';
  if (name.length > maxMemberNameLength) {
    return (
      name: null,
      error: 'Keep your name to $maxMemberNameLength characters.',
    );
  }
  return (name: name, error: null);
}

/// Response of `POST /v1/auth/mobile/google` and `/refresh`.
///
/// [accessTokenExpiresAt] is the server's clock. The device clock may be
/// skewed, so the session is timed by its [lifetime] (expiry minus the
/// response's `Date` header) from when the app received it.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.user,
    this.serverDate,
  });

  AuthSession.fromJson(Map<String, dynamic> json, {this.serverDate})
    : accessToken = json['accessToken'] as String,
      accessTokenExpiresAt = DateTime.parse(
        json['accessTokenExpiresAt'] as String,
      ),
      refreshToken = json['refreshToken'] as String,
      user = AuthUser.fromJson(json['user'] as Map<String, dynamic>);

  final String accessToken, refreshToken;
  final DateTime accessTokenExpiresAt;
  final AuthUser user;

  /// The server's `Date` header on the response, when it sent one.
  final DateTime? serverDate;

  /// Assumed when the response has no `Date` header.
  static const fallbackLifetime = Duration(hours: 1);

  /// How long the access token lives, measured on the server's clock only.
  Duration get lifetime {
    final date = serverDate;
    if (date == null) return fallbackLifetime;
    final lifetime = accessTokenExpiresAt.difference(date);
    return lifetime.isNegative ? Duration.zero : lifetime;
  }
}

const _months = {
  'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, //
  'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
};

/// Parses an HTTP `Date` header (IMF-fixdate, e.g.
/// `Tue, 24 Nov 2026 12:00:00 GMT`). Null when absent or malformed.
DateTime? parseHttpDate(String? value) {
  final match = RegExp(
    r'^\w{3}, (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$',
  ).firstMatch(value?.trim() ?? '');
  final month = _months[match?.group(2)];
  if (match == null || month == null) return null;
  int part(int i) => int.parse(match.group(i)!);
  return DateTime.utc(part(3), month, part(1), part(4), part(5), part(6));
}

/// Methods that credit dues without money changing hands.
const creditMethods = {'volunteer', 'waived'};

/// The label for a payment method as the API sends it (`stripe`, `cash`,
/// `volunteer`…). Unknown methods are capitalised; null stays null.
String? paymentMethodLabel(String? method) => switch (method) {
  null => null,
  'stripe' => 'Card',
  'cash' => 'Cash',
  'venmo' => 'Venmo',
  'zelle' => 'Zelle',
  'check' => 'Check',
  'other' => 'Other',
  'volunteer' => 'Volunteered',
  'waived' => 'Waived',
  final other when other.isEmpty => null,
  final other => '${other[0].toUpperCase()}${other.substring(1)}',
};

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
      creditedCents = _cents(json['creditedCents']),
      balanceCents = _cents(json['balanceCents']),
      pendingCheckoutCents = _cents(json['pendingCheckoutCents']);

  final String id, playerSubject, description;
  final int amountCents, paidCents, balanceCents, pendingCheckoutCents;

  /// The part of [paidCents] that is volunteer or waived credit, not money.
  final int creditedCents;
  final DateTime? dueDate;

  /// What was actually paid in money: [paidCents] less [creditedCents].
  int get moneyPaidCents {
    final cents = paidCents - creditedCents;
    return cents > 0 ? cents : 0;
  }

  bool get hasPendingCheckout => pendingCheckoutCents > 0;
  bool get settled => balanceCents <= 0;
}

class DuesPayment {
  DuesPayment.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      amountCents = _cents(json['amountCents']),
      recordedAt = DateTime.tryParse(json['recordedAt'] as String? ?? ''),
      method = _opt(json['method']),
      note = _opt(json['note']),
      voidedAt = json['voidedAt'] is String
          ? DateTime.tryParse(json['voidedAt'] as String)
          : null,
      voidedBy = _opt(json['voidedBy']),
      voidReason = _opt(json['voidReason']);

  final String id;
  final int amountCents;
  final DateTime? recordedAt;

  /// `stripe`, `cash`, `venmo`, `zelle`, `check`, `other`, `volunteer` or
  /// `waived`; null for payments recorded before methods were tracked.
  final String? method;

  /// "Card", "Venmo", "Volunteered"…; null when the method isn't known.
  String? get methodLabel => paymentMethodLabel(method);

  /// Volunteer or waived credit rather than money.
  bool get isCredit => creditMethods.contains(method);

  /// Admin-only; always null on the player routes.
  final String? note;

  /// When an admin undid the payment; it no longer counts. Admin-only, and
  /// absent from older API responses.
  final DateTime? voidedAt;

  /// Who undid it (email or subject), and why. Admin-only.
  final String? voidedBy, voidReason;

  /// Undone by an admin: shown crossed out, can't be edited or undone again.
  bool get voided => voidedAt != null;
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
