import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../data/club_repository.dart';
import '../../data/club_time.dart';
import '../../data/teams.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';

/// The next [limit] Claymores matches still to play, soonest first, as on
/// the website's Club Admin. Club events (the Highland Games) count: the
/// club plays there.
List<Fixture> upcomingClaymoresMatches(
  Iterable<Fixture> fixtures,
  DateTime today, {
  int limit = 6,
}) =>
    (fixtures
            .where((f) => f.status == 'upcoming' && !f.date.isBefore(today))
            .toList()
          ..sort((a, b) => a.date.compareTo(b.date)))
        .take(limit)
        .toList(growable: false);

/// One upcoming match for admins: who can play and the lineup's state.
/// [availability] / [lineup] are null when they didn't load.
class AdminMatch {
  const AdminMatch({
    required this.fixture,
    this.availability,
    this.lineup,
    this.availabilityMissing = false,
  });

  final Fixture fixture;
  final AdminAvailability? availability;
  final Lineup? lineup;

  /// The API answered 404: it doesn't know the match (or availability is
  /// switched off).
  final bool availabilityMissing;

  bool get home => TeamResolver.isClaymores(fixture.home);
  String get opponent => home ? fixture.away : fixture.home;

  /// "vs Tampa Bay" at home, "at Tampa Bay" away.
  String get title => fixture.isClubEvent
      ? fixture.eventName
      : '${home ? 'vs' : 'at'} $opponent';

  /// The upcoming matches with each one's availability and lineup.
  static Future<List<AdminMatch>> load(
    AdminRepository admin,
    Future<ClubData> club, {
    DateTime? today,
  }) async {
    final data = await club;
    final matches = upcomingClaymoresMatches(
      data.fixtures,
      today ?? clubToday(),
    );
    return Future.wait(
      matches.map((fixture) async {
        Object? availabilityError;
        final (availability, lineup) = await (
          admin
              .matchAvailability(fixture.id)
              .then<AdminAvailability?>(
                (v) => v,
                onError: (Object e) {
                  availabilityError = e;
                  return null;
                },
              ),
          admin
              .lineup(fixture.id)
              .then<Lineup?>((v) => v, onError: (Object _) => null),
        ).wait;
        final error = availabilityError;
        return AdminMatch(
          fixture: fixture,
          availability: availability,
          lineup: lineup,
          availabilityMissing: error is ApiException && error.statusCode == 404,
        );
      }),
    );
  }
}

/// "Sat Jan 23" for the overview tile; "Sat, Jan 23" is
/// [MaterialLocalizations.formatMediumDate].
String shortMatchDate(BuildContext context, DateTime date) =>
    MaterialLocalizations.of(context)
        .formatMediumDate(date)
        .replaceFirst(', ', ' ');

/// "No lineup", "Draft" or "Published".
class LineupChip extends StatelessWidget {
  const LineupChip({super.key, required this.status});
  final LineupStatus status;

  static String label(LineupStatus status) => switch (status) {
    LineupStatus.none => 'No lineup',
    LineupStatus.draft => 'Draft',
    LineupStatus.published => 'Published',
  };

  @override
  Widget build(BuildContext context) {
    final (fill, border) = switch (status) {
      LineupStatus.none => (Brand.muted, Brand.divider),
      LineupStatus.draft => (Brand.pinkTint, Brand.pinkBorder),
      LineupStatus.published => (Brand.blueTint, Brand.blueBorder),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: fill,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label(status).toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: status == LineupStatus.none ? Brand.secondary : Brand.ink,
        ),
      ),
    );
  }
}

/// One row on the Matches tab: crest, opponent, date, who can play and the
/// lineup chip. Opens the match page, where the breakdown and the lineup
/// editor live.
class AdminMatchRow extends StatelessWidget {
  const AdminMatchRow({
    super.key,
    required this.match,
    required this.onOpen,
    this.onLineup,
  });

  final AdminMatch match;
  final VoidCallback onOpen;

  /// Coaches: straight to the lineup editor, skipping the match page.
  final VoidCallback? onLineup;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final fixture = match.fixture;
    final date = [
      MaterialLocalizations.of(context).formatMediumDate(fixture.date),
      if (fixture.kickoff.isNotEmpty) fixture.kickoff,
    ].join(' · ');
    final availability = match.availability;
    final counts = availability != null
        ? availability.counts.compactSummary
        : match.availabilityMissing
        ? 'The club server doesn’t know this match yet'
        : 'Availability couldn’t load';
    final lineup = match.lineup;
    return Semantics(
      button: true,
      label: [
        match.title,
        date,
        counts,
        if (lineup != null) LineupChip.label(lineup.status),
      ].join('. '),
      onTapHint: 'open the match',
      excludeSemantics: onLineup == null,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              TeamLogo(name: match.opponent, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(match.title, style: textTheme.titleMedium),
                    Text(date, style: textTheme.bodySmall),
                    const SizedBox(height: 2),
                    Text(
                      counts,
                      style: textTheme.bodyMedium?.copyWith(
                        fontFeatures: tabularFigures,
                      ),
                    ),
                    if (onLineup != null)
                      TextButton.icon(
                        key: Key('edit-lineup-${fixture.id}'),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(0, 36),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: onLineup,
                        icon: const Icon(Icons.edit_note, size: 18),
                        label: const Text('EDIT LINEUP'),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (lineup != null) LineupChip(status: lineup.status),
              const Icon(Icons.chevron_right, color: Brand.secondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// The Matches tab: the next upcoming Claymores matches.
class AdminMatchesList extends StatelessWidget {
  const AdminMatchesList({
    super.key,
    required this.matches,
    required this.onOpen,
    this.onLineup,
  });

  final List<AdminMatch> matches;
  final void Function(AdminMatch match) onOpen;

  /// Set for coaches and the super admin, who pick lineups.
  final void Function(AdminMatch match)? onLineup;

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return const StatusPanel(
        message: 'No upcoming matches.',
        detail: 'Matches on the fixtures list show up here.',
      );
    }
    if (matches.every((m) => m.availabilityMissing)) {
      return const StatusPanel(
        message: 'Availability isn’t switched on yet.',
        detail:
            'The club server doesn’t have match availability yet. It shows '
            'here once the API is updated.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          onLineup != null
              ? 'Players answer until match day. Tap Edit lineup to pick '
                    'from who can play, or open a match for the details.'
              : 'Players answer until match day. Open a match to see who can '
                    'play. The coach picks the lineup.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (i, match) in matches.indexed) ...[
                if (i > 0) const Divider(height: 1),
                AdminMatchRow(
                  key: ValueKey('admin-match-${match.fixture.id}'),
                  match: match,
                  onOpen: () => onOpen(match),
                  onLineup: onLineup == null ? null : () => onLineup!(match),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
