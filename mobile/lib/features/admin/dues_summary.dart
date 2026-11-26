import '../../data/models/account.dart';
import '../profile/payment_amount.dart';

/// Where one player's dues stand.
enum DuesStanding {
  /// Nothing left to pay, and money paid toward it.
  paid,

  /// Nothing left to pay, waived (some may have been volunteered).
  waived,

  /// Nothing left to pay, all of it volunteered.
  volunteered,

  /// Some paid, some still owed.
  partial,

  /// Nothing paid yet.
  unpaid;

  static DuesStanding of(DuesAssessment dues) => dues.balanceCents <= 0
      ? (dues.settledByVolunteering
            ? volunteered
            : dues.settledByCredit
            ? waived
            : paid)
      : dues.paidCents > 0
      ? partial
      : unpaid;
}

/// Every assessment that shares a description ("2026-27 Season dues"),
/// matched case-insensitively and ignoring surrounding spaces.
class DuesGroup {
  DuesGroup._(this.key, this.description, this.items)
    : paid = [
        for (final d in items)
          if (DuesStanding.of(d) == DuesStanding.paid) d,
      ],
      waived = [
        for (final d in items)
          if (DuesStanding.of(d) == DuesStanding.waived) d,
      ],
      volunteered = [
        for (final d in items)
          if (DuesStanding.of(d) == DuesStanding.volunteered) d,
      ],
      partial = [
        for (final d in items)
          if (DuesStanding.of(d) == DuesStanding.partial) d,
      ],
      unpaid = [
        for (final d in items)
          if (DuesStanding.of(d) == DuesStanding.unpaid) d,
      ],
      collectedCents = items.fold(0, (sum, d) => sum + d.moneyPaidCents),
      creditedCents = items.fold(0, (sum, d) => sum + d.creditedCents),
      outstandingCents = items.fold(
        0,
        (sum, d) => sum + (d.balanceCents > 0 ? d.balanceCents : 0),
      );

  /// The normalised description the group was matched on.
  final String key;

  /// The description as first written (trimmed).
  final String description;
  final List<DuesAssessment> items;
  final List<DuesAssessment> paid, waived, volunteered, partial, unpaid;

  /// Money actually paid (volunteer and waived credit left out).
  final int collectedCents;

  /// Volunteer and waived credit: counts toward the balance, isn't money.
  final int creditedCents;
  final int outstandingCents;

  int get count => items.length;

  /// Share of players paid in full, and partly paid (0–1), for the bar.
  double get paidShare => count == 0 ? 0 : paid.length / count;
  double get partialShare => count == 0 ? 0 : partial.length / count;

  /// "$125 each", or "$100–$125 each" when amounts differ.
  String get amountLabel {
    final amounts = items.map((d) => d.amountCents).toSet().toList()..sort();
    if (amounts.isEmpty) return '';
    return amounts.length == 1
        ? '${formatDollars(amounts.single)} each'
        : '${formatDollars(amounts.first)}–${formatDollars(amounts.last)} each';
  }

  /// "2026-27 Season dues · $125 each".
  String get title => '$description · $amountLabel';

  /// "14 of 22 paid in full · 1 waived · 5 partly paid · 3 unpaid"; zero
  /// counts after the first are left out.
  String get progressLine => [
    '${paid.length} of $count paid in full',
    if (waived.isNotEmpty) '${waived.length} waived',
    if (volunteered.isNotEmpty) '${volunteered.length} volunteered',
    if (partial.isNotEmpty) '${partial.length} partly paid',
    if (unpaid.isNotEmpty) '${unpaid.length} unpaid',
  ].join(' · ');

  /// "$1,950 collected · $250 credited · $800 outstanding"; credited is
  /// left out when there is none.
  String get moneyLine => [
    '${formatDollars(collectedCents)} collected',
    if (creditedCents > 0) '${formatDollars(creditedCents)} credited',
    '${formatDollars(outstandingCents)} outstanding',
  ].join(' · ');

  /// Latest due date in the group, for ordering.
  DateTime? get latestDueDate => items
      .map((d) => d.dueDate)
      .whereType<DateTime>()
      .fold<DateTime?>(
        null,
        (latest, d) => latest == null || d.isAfter(latest) ? d : latest,
      );
}

/// Groups [dues] by description. Groups are ordered by their latest due
/// date (newest first, undated last), then by description; assessments keep
/// the API's order within a group.
List<DuesGroup> summarizeDues(Iterable<DuesAssessment> dues) {
  final byKey = <String, List<DuesAssessment>>{};
  final names = <String, String>{};
  for (final d in dues) {
    final trimmed = d.description.trim();
    final description = trimmed.isEmpty ? 'Dues' : trimmed;
    final key = description.toLowerCase();
    names.putIfAbsent(key, () => description);
    byKey.putIfAbsent(key, () => []).add(d);
  }
  final groups = [
    for (final MapEntry(:key, :value) in byKey.entries)
      DuesGroup._(key, names[key]!, List.unmodifiable(value)),
  ];
  groups.sort((a, b) {
    final da = a.latestDueDate, db = b.latestDueDate;
    if (da != null && db != null && da != db) return db.compareTo(da);
    if ((da == null) != (db == null)) return da == null ? 1 : -1;
    return a.key.compareTo(b.key);
  });
  return groups;
}

/// Whole dollars without cents ("$1,950"); otherwise as [formatCents].
String formatDollars(int cents) {
  final text = formatCents(cents);
  return cents % 100 == 0 ? text.substring(0, text.length - 3) : text;
}

/// Parses a typed dollar amount ("25", "25.5", "$1,025.00") into cents, or
/// null when it isn't one.
int? parseDollars(String input) {
  final text = input.trim().replaceFirst(r'$', '').replaceAll(',', '');
  final match = RegExp(r'^(\d*)(?:\.(\d{0,2}))?$').firstMatch(text);
  if (text.isEmpty || text == '.' || match == null) return null;
  final dollars = int.tryParse(match[1]!.isEmpty ? '0' : match[1]!);
  if (dollars == null) return null;
  return dollars * 100 + int.parse((match[2] ?? '').padRight(2, '0'));
}
