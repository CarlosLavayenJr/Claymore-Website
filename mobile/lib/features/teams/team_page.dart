import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/head_to_head.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';
import '../fixtures/club_data_view.dart';
import '../fixtures/fixture_card.dart';

/// `/team/:slug`: the app's version of the website's `/opponents/[slug]`
/// page. The all-time head-to-head record and every fixture against the
/// team, computed from the schedule the app already loads.
class TeamPage extends StatelessWidget {
  const TeamPage({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context) {
    final directory = teamDirectoryOf(context);
    return Scaffold(
      appBar: AppBar(title: const Text('TEAM')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: ListenableBuilder(
            listenable: directory,
            builder: (context, _) {
              final team = directory.bySlug(slug);
              if (team == null) {
                return const PageList(
                  children: [StatusPanel(message: 'This team isn’t listed.')],
                );
              }
              return ClubDataView(
                storageKey: 'team-$slug',
                builder: (context, data) => _content(
                  context,
                  HeadToHead.compute(team, data.fixtures, directory.resolve),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, HeadToHead record) {
    final team = record.team;
    return [
      Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TeamLogo(name: team.name, size: 88),
            const SizedBox(height: 16),
            BrandHeader(
              eyebrow: 'Florida Rugby Union opponent',
              title: '${team.name} vs Central Florida Claymores RFC',
              titleSize: 24,
              body: team.city == null ? null : 'Based in ${team.city}',
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      _StatRow(record: record),
      const SizedBox(height: 24),
      SectionHeading(
        'ALL-TIME RESULTS VS ${team.name.toUpperCase()} '
        '(${record.played} PLAYED)',
      ),
      if (record.matches.isEmpty)
        const StatusPanel(message: 'No matches recorded yet.')
      else
        Panel(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, match) in record.matches.indexed) ...[
                if (index > 0) const Divider(height: 1),
                _MatchRow(match: match),
              ],
            ],
          ),
        ),
    ];
  }
}

/// WINS / LOSSES / DRAWS / PF / PA, from the Claymores' point of view.
class _StatRow extends StatelessWidget {
  const _StatRow({required this.record});
  final HeadToHead record;

  @override
  Widget build(BuildContext context) {
    final stats = [
      ('WINS', 'wins', record.wins, Brand.blue),
      ('LOSSES', 'losses', record.losses, Brand.secondary),
      ('DRAWS', 'draws', record.draws, Brand.pink),
      ('PF', 'points for', record.pointsFor, Brand.ink),
      ('PA', 'points against', record.pointsAgainst, Brand.ink),
    ];
    final label = Theme.of(context).textTheme.labelSmall
        ?.copyWith(color: Brand.secondary);
    return Panel(
      padding: EdgeInsets.zero,
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (final (index, (title, spoken, value, color))
                in stats.indexed) ...[
              if (index > 0) const VerticalDivider(width: 1),
              Expanded(
                child: Semantics(
                  container: true,
                  label: '$value $spoken',
                  excludeSemantics: true,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: Column(
                      children: [
                        Text(
                          '$value',
                          key: ValueKey('stat-$title'),
                          style: displayStyle(
                            24,
                            color: color,
                          ).copyWith(fontFeatures: tabularFigures),
                        ),
                        const SizedBox(height: 4),
                        Text(title, style: label),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Date, "season · Home/Away · competition", score and result badge.
/// Opens the match details.
class _MatchRow extends StatelessWidget {
  const _MatchRow({required this.match});
  final HeadToHeadMatch match;

  @override
  Widget build(BuildContext context) {
    final fixture = match.fixture;
    final textTheme = Theme.of(context).textTheme;
    final date = MaterialLocalizations.of(context).formatFullDate(fixture.date);
    return MergeSemantics(
      child: InkWell(
        key: ValueKey('h2h-${fixture.id}'),
        onTap: () => context.push(matchLocation(fixture), extra: fixture),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      date,
                      style: textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(match.detail, style: textTheme.bodySmall),
                  ],
                ),
              ),
              if (match.scored) ...[
                const SizedBox(width: 12),
                Text(
                  '${match.ours}–${match.theirs}',
                  style: const TextStyle(
                    fontFeatures: tabularFigures,
                    fontWeight: FontWeight.w700,
                    color: Brand.ink,
                  ),
                ),
              ],
              const SizedBox(width: 10),
              _ResultBadge(result: match.result),
            ],
          ),
        ),
      ),
    );
  }
}

class _ResultBadge extends StatelessWidget {
  const _ResultBadge({required this.result});
  final String result;

  @override
  Widget build(BuildContext context) {
    final (fill, border, text) = switch (result) {
      'W' => (Brand.blueTint, Brand.blueBorder, Brand.ink),
      'L' => (Brand.muted, Brand.divider, Brand.secondary),
      'D' => (Brand.pinkTint, Brand.pinkBorder, Brand.ink),
      _ => (Brand.muted, Brand.divider, Brand.secondary),
    };
    return Container(
      constraints: const BoxConstraints(minWidth: 32),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: fill,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        result,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: text,
        ),
      ),
    );
  }
}
