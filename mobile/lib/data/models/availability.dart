// Match availability and lineups from the Claymores API
// (`/v1/fixtures/{id}/availability`, `/v1/fixtures/{id}/lineup` and the
// admin versions under `/v1/admin/fixtures/{id}/...`).

String? _opt(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

int _int(Object? value) => value is num ? value.toInt() : 0;

/// A member's answer to "can you play?". `null` (no reply) is kept separate.
enum AvailabilityStatus {
  available('available', 'AVAILABLE', 'Available'),
  maybe('maybe', 'MAYBE', 'Maybe'),
  unavailable('unavailable', 'OUT', 'Out');

  const AvailabilityStatus(this.api, this.button, this.label);

  /// The API's value.
  final String api;

  /// Uppercase button label.
  final String button;
  final String label;

  static AvailabilityStatus? fromApi(Object? value) {
    for (final status in values) {
      if (status.api == value) return status;
    }
    return null;
  }
}

class AvailabilityCounts {
  const AvailabilityCounts({
    this.available = 0,
    this.maybe = 0,
    this.unavailable = 0,
    this.noReply = 0,
  });

  AvailabilityCounts.fromJson(Map<String, dynamic>? json)
    : available = _int(json?['available']),
      maybe = _int(json?['maybe']),
      unavailable = _int(json?['unavailable']),
      noReply = _int(json?['noReply']);

  final int available, maybe, unavailable, noReply;

  int of(AvailabilityStatus? status) => switch (status) {
    AvailabilityStatus.available => available,
    AvailabilityStatus.maybe => maybe,
    AvailabilityStatus.unavailable => unavailable,
    null => noReply,
  };

  /// The counts after one member's answer moves from [from] to [to].
  AvailabilityCounts move(AvailabilityStatus? from, AvailabilityStatus? to) {
    if (from == to) return this;
    int adjust(AvailabilityStatus? bucket) {
      var value = of(bucket);
      if (bucket == from && value > 0) value--;
      if (bucket == to) value++;
      return value;
    }

    return AvailabilityCounts(
      available: adjust(AvailabilityStatus.available),
      maybe: adjust(AvailabilityStatus.maybe),
      unavailable: adjust(AvailabilityStatus.unavailable),
      noReply: adjust(null),
    );
  }

  /// "14 available · 3 maybe · 4 out · 9 no reply".
  String get summary =>
      '$available available · $maybe maybe · $unavailable out · '
      '$noReply no reply';

  /// [summary] without the zeros, as on the website's Club Admin: "14
  /// available · 3 maybe · 9 no reply", or "No answers yet".
  String get compactSummary {
    final parts = [
      if (available > 0) '$available available',
      if (maybe > 0) '$maybe maybe',
      if (unavailable > 0) '$unavailable out',
      if (noReply > 0) '$noReply no reply',
    ];
    return parts.isEmpty ? 'No answers yet' : parts.join(' · ');
  }
}

/// One of the member's own answers (`GET /v1/availability/mine`).
class AvailabilityAnswer {
  const AvailabilityAnswer({
    required this.fixtureId,
    required this.status,
    this.note,
  });

  AvailabilityAnswer.fromJson(Map<String, dynamic> json)
    : fixtureId = json['fixtureId'] as String,
      status = AvailabilityStatus.fromApi(json['status']),
      note = _opt(json['note']);

  final String fixtureId;
  final AvailabilityStatus? status;
  final String? note;
}

/// `GET|PUT /v1/fixtures/{id}/availability`: my answer, the club's counts
/// and whether answers are still open (until the end of match day).
class MyAvailability {
  const MyAvailability({
    required this.fixtureId,
    this.status,
    this.note,
    this.updatedAt,
    this.counts = const AvailabilityCounts(),
    this.open = true,
  });

  MyAvailability.fromJson(Map<String, dynamic> json)
    : fixtureId = json['fixtureId'] as String,
      status = AvailabilityStatus.fromApi(json['status']),
      note = _opt(json['note']),
      updatedAt = _date(json['updatedAt']),
      counts = AvailabilityCounts.fromJson(
        json['counts'] as Map<String, dynamic>?,
      ),
      open = json['open'] as bool? ?? false;

  final String fixtureId;
  final AvailabilityStatus? status;
  final String? note;
  final DateTime? updatedAt;
  final AvailabilityCounts counts;
  final bool open;

  AvailabilityAnswer get answer =>
      AvailabilityAnswer(fixtureId: fixtureId, status: status, note: note);

  /// My answer changed locally before the server confirms it.
  MyAvailability answered(AvailabilityStatus status, String? note) =>
      MyAvailability(
        fixtureId: fixtureId,
        status: status,
        note: note,
        updatedAt: updatedAt,
        counts: counts.move(this.status, status),
        open: open,
      );

  MyAvailability closed() => MyAvailability(
    fixtureId: fixtureId,
    status: status,
    note: note,
    updatedAt: updatedAt,
    counts: counts,
    open: false,
  );
}

/// One member's answer for admins. [status] null: no reply yet.
class MemberAvailability {
  const MemberAvailability({
    required this.subject,
    this.email = '',
    this.name,
    this.status,
    this.note,
    this.updatedAt,
  });

  MemberAvailability.fromJson(Map<String, dynamic> json)
    : subject = json['subject'] as String,
      email = json['email'] as String? ?? '',
      name = _opt(json['name']),
      status = AvailabilityStatus.fromApi(json['status']),
      note = _opt(json['note']),
      updatedAt = _date(json['updatedAt']);

  final String subject, email;
  final String? name, note;
  final AvailabilityStatus? status;
  final DateTime? updatedAt;

  String get label => name ?? (email.isEmpty ? 'Club member' : email);
}

/// `GET /v1/admin/fixtures/{id}/availability`.
class AdminAvailability {
  const AdminAvailability({
    required this.fixtureId,
    required this.counts,
    required this.members,
  });

  AdminAvailability.fromJson(Map<String, dynamic> json)
    : fixtureId = json['fixtureId'] as String,
      counts = AvailabilityCounts.fromJson(
        json['counts'] as Map<String, dynamic>?,
      ),
      members = (json['members'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MemberAvailability.fromJson)
          .toList(growable: false);

  final String fixtureId;
  final AvailabilityCounts counts;
  final List<MemberAvailability> members;

  /// Members with [status] (null: no reply), by name.
  List<MemberAvailability> withStatus(AvailabilityStatus? status) =>
      members.where((m) => m.status == status).toList()..sort(
        (a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()),
      );
}

/// Starters 1–15 have a position; 16–23 are replacements.
const lineupStarters = 15;
const lineupSize = 23;

const _positions = [
  'Loosehead prop',
  'Hooker',
  'Tighthead prop',
  'Lock',
  'Lock',
  'Blindside flanker',
  'Openside flanker',
  'Number 8',
  'Scrum-half',
  'Fly-half',
  'Left wing',
  'Inside centre',
  'Outside centre',
  'Right wing',
  'Fullback',
];

String lineupPosition(int number) => number >= 1 && number <= lineupStarters
    ? _positions[number - 1]
    : 'Replacement';

class LineupSlot {
  const LineupSlot({
    required this.number,
    required this.subject,
    String? position,
    this.name,
  }) : position = position ?? '';

  LineupSlot.fromJson(Map<String, dynamic> json)
    : number = _int(json['number']),
      position = _opt(json['position']) ?? lineupPosition(_int(json['number'])),
      subject = json['subject'] as String? ?? '',
      name = _opt(json['name']);

  final int number;
  final String position, subject;
  final String? name;

  String get label => name ?? 'Club member';
}

enum LineupStatus {
  none('none', 'Not started'),
  draft('draft', 'Draft'),
  published('published', 'Published');

  const LineupStatus(this.api, this.label);
  final String api, label;

  static LineupStatus fromApi(Object? value) =>
      values.where((s) => s.api == value).firstOrNull ?? none;
}

/// `GET /v1/fixtures/{id}/lineup` (members: published only) and the admin
/// version (draft or published).
class Lineup {
  const Lineup({
    required this.fixtureId,
    this.status = LineupStatus.none,
    this.publishedAt,
    this.updatedAt,
    this.slots = const [],
  });

  Lineup.fromJson(Map<String, dynamic> json)
    : fixtureId = json['fixtureId'] as String,
      status = LineupStatus.fromApi(json['status']),
      publishedAt = _date(json['publishedAt']),
      updatedAt = _date(json['updatedAt']),
      slots =
          (json['slots'] as List? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(LineupSlot.fromJson)
              .toList()
            ..sort((a, b) => a.number.compareTo(b.number));

  final String fixtureId;
  final LineupStatus status;
  final DateTime? publishedAt, updatedAt;
  final List<LineupSlot> slots;

  bool get published => status == LineupStatus.published;
  List<LineupSlot> get starters =>
      slots.where((s) => s.number <= lineupStarters).toList();
  List<LineupSlot> get replacements =>
      slots.where((s) => s.number > lineupStarters).toList();
}
