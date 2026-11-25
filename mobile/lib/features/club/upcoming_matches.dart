import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/club_repository.dart';
import '../../data/club_time.dart';
import '../../data/member_repository.dart';
import '../../data/teams.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';
import '../admin/admin_matches.dart' show upcomingClaymoresMatches;
import '../fixtures/availability.dart';
import '../fixtures/fixture_card.dart' show FixtureBadge, matchLocation;

/// Club tab: the next matches, one row each, as on the website's account
/// page. Players answer "can you play?" right in the row (the next unanswered
/// match starts open). Coaches don't play, so they see how many can.
class UpcomingMatchesSection extends StatelessWidget {
  const UpcomingMatchesSection({
    super.key,
    required this.members,
    required this.plays,
  });

  final MemberRepository members;
  final bool plays;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([services.club, services.availability]),
      builder: (context, _) => FutureBuilder<ClubData>(
        future: services.club.data,
        builder: (context, snapshot) {
          final data = snapshot.data;
          if (data == null) return const SizedBox.shrink();
          final matches = upcomingClaymoresMatches(
            data.fixtures,
            clubToday(),
            limit: 4,
          );
          final store = services.availability;
          final firstOpen = plays && store.loaded
              ? matches
                    .where((m) => store.answerFor(m.id) == null)
                    .firstOrNull
                    ?.id
              : null;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionHeading('UPCOMING MATCHES'),
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  plays
                      ? 'Let the coaches know if you can play. You can change '
                            'your answer until match day.'
                      : 'How many players can make each match. Open Club '
                            'Admin to see names and pick lineups.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (matches.isEmpty)
                const StatusPanel(message: 'No matches on the calendar.')
              else
                for (final match in matches)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _MatchRow(
                      key: ValueKey('upcoming-${match.id}'),
                      fixture: match,
                      members: members,
                      plays: plays,
                      answer: store.answerFor(match.id)?.status,
                      initiallyOpen: match.id == firstOpen,
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}

class _MatchRow extends StatefulWidget {
  const _MatchRow({
    super.key,
    required this.fixture,
    required this.members,
    required this.plays,
    required this.answer,
    required this.initiallyOpen,
  });

  final Fixture fixture;
  final MemberRepository members;
  final bool plays;
  final AvailabilityStatus? answer;
  final bool initiallyOpen;

  @override
  State<_MatchRow> createState() => _MatchRowState();
}

class _MatchRowState extends State<_MatchRow> {
  late bool open = widget.initiallyOpen;

  /// Coaches: the club's counts for the row's badge.
  late final Future<MyAvailability>? counts = widget.plays
      ? null
      : widget.members.availability(widget.fixture.id);

  @override
  Widget build(BuildContext context) {
    final fixture = widget.fixture;
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    final home = TeamResolver.isClaymores(fixture.home);
    final opponent = home ? fixture.away : fixture.home;
    final logo = home ? fixture.awayLogo : fixture.homeLogo;
    final details = [
      localizations.formatMediumDate(fixture.date),
      if (fixture.kickoff.isNotEmpty) fixture.kickoff,
      if (fixture.venue.isNotEmpty) fixture.venue,
    ].join(' · ');

    final Widget badge = widget.plays
        ? widget.answer != null
              ? AvailabilityPill(status: widget.answer!)
              : const FixtureBadge(label: 'ANSWER', accent: true)
        : FutureBuilder<MyAvailability>(
            future: counts,
            builder: (context, snapshot) => FixtureBadge(
              label: snapshot.hasData
                  ? '${snapshot.data!.counts.available} AVAILABLE'
                  : 'MATCH',
            ),
          );

    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: widget.plays ? open : null,
            child: InkWell(
              onTap: widget.plays
                  ? () => setState(() => open = !open)
                  : () => context.push(matchLocation(fixture), extra: fixture),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                child: Row(
                  children: [
                    TeamLogo(name: opponent, url: logo, size: 40),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${home ? 'vs' : 'at'} $opponent',
                            style: textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            details,
                            style: textTheme.bodySmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    badge,
                    Icon(
                      widget.plays
                          ? (open ? Icons.expand_less : Icons.expand_more)
                          : Icons.chevron_right,
                      color: Brand.secondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (widget.plays && open) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
              child: MatchAvailabilityPanel(
                fixtureId: fixture.id,
                members: widget.members,
                embedded: true,
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
                child: TextButton(
                  onPressed: () =>
                      context.push(matchLocation(fixture), extra: fixture),
                  child: const Text('MATCH DETAILS'),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
