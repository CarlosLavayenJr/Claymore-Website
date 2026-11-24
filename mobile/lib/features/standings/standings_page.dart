import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/standings_repository.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';

class StandingsPage extends StatefulWidget {
  const StandingsPage({super.key});

  @override
  State<StandingsPage> createState() => _StandingsPageState();
}

class _StandingsPageState extends State<StandingsPage> {
  StandingsController? controller;
  Future<List<StandingsSeason>>? seasons;

  /// The table for a picked [season]. The current season comes from the
  /// shared [StandingsController], which the Home preview also reads.
  Future<Standings?>? picked;

  /// Null shows the API's current season.
  String? season;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppScope.of(context).standingsTable;
    if (next != controller) {
      controller = next;
      if (next.available) loadSeasons();
    }
  }

  void loadSeasons() {
    seasons = controller!.repository.seasons().catchError(
      (Object _) => <StandingsSeason>[],
    );
  }

  Future<void> refresh() async {
    final shared = controller!;
    setState(() {
      loadSeasons();
      if (season != null) picked = shared.repository.standings(season: season);
    });
    if (season == null) return shared.reload();
    await picked?.then<void>((_) {}, onError: (Object _) {});
  }

  void pickSeason(String? value) {
    if (value == null) return;
    setState(() {
      season = value;
      picked = controller!.repository.standings(season: value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final shared = controller;
    if (shared == null || !shared.available) {
      return const PageList(
        storageKey: 'standings',
        children: [
          SectionHeading('STANDINGS'),
          StatusPanel(
            message: 'Standings need the club API.',
            detail:
                'This build isn’t connected to the Claymores API. League '
                'tables appear in builds made with CLAYMORES_API_BASE_URL.',
          ),
        ],
      );
    }
    return ListenableBuilder(
      listenable: shared,
      builder: (context, _) => _page(season == null ? shared.current : picked),
    );
  }

  Widget _page(Future<Standings?>? table) {
    return FutureBuilder<Standings?>(
      future: table,
      builder: (context, snapshot) {
        final loading = snapshot.connectionState != ConnectionState.done;
        final standings = snapshot.data;
        return RefreshIndicator(
          onRefresh: refresh,
          child: PageList(
            storageKey: 'standings',
            children: [
              const SectionHeading('STANDINGS'),
              _SeasonPicker(
                seasons: seasons,
                selected: season ?? standings?.seasonLabel,
                onChanged: loading ? null : pickSeason,
              ),
              const SizedBox(height: 14),
              if (loading)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (snapshot.hasError)
                StatusPanel(
                  message: 'Couldn’t load the standings.',
                  detail: 'Check your connection and try again.',
                  action: FilledButton(
                    onPressed: refresh,
                    child: const Text('Retry'),
                  ),
                )
              else if (standings == null || standings.rows.isEmpty)
                StatusPanel(
                  message: 'Standings TBD.',
                  detail: season == null
                      ? 'No league table has been published yet.'
                      : 'No league table is published for $season.',
                )
              else ...[
                LeagueTable(standings: standings),
                if (standings.playoffs.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const SectionHeading('PLAYOFFS'),
                  PlayoffList(standings: standings),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

class _SeasonPicker extends StatelessWidget {
  const _SeasonPicker({
    required this.seasons,
    required this.selected,
    required this.onChanged,
  });

  final Future<List<StandingsSeason>>? seasons;
  final String? selected;
  final ValueChanged<String?>? onChanged;

  @override
  Widget build(BuildContext context) => FutureBuilder<List<StandingsSeason>>(
    future: seasons,
    builder: (context, snapshot) {
      final labels = [
        for (final season in snapshot.data ?? const <StandingsSeason>[])
          season.seasonLabel,
      ];
      if (selected != null && !labels.contains(selected)) {
        labels.insert(0, selected!);
      }
      if (labels.length < 2) return const SizedBox.shrink();
      return DropdownButton<String>(
        isExpanded: true,
        value: selected,
        hint: const Text('Season'),
        items: [
          for (final label in labels)
            DropdownMenuItem(value: label, child: Text('Season $label')),
        ],
        onChanged: onChanged,
      );
    },
  );
}

/// Pos and Team stay put; the numbers scroll sideways on narrow screens.
class LeagueTable extends StatelessWidget {
  const LeagueTable({super.key, required this.standings});
  final Standings standings;

  static const _rowHeight = 46.0;

  /// Scrolling stat columns: label, meaning (tooltip), width.
  static const _stats = [
    ('P', 'Played', 40.0),
    ('W', 'Won', 40.0),
    ('L', 'Lost', 40.0),
    ('D', 'Drawn', 40.0),
    ('PF', 'Points for', 44.0),
    ('PA', 'Points against', 44.0),
    ('Diff', 'Points difference', 52.0),
    ('BP', 'Bonus points', 40.0),
  ];

  static String _stat(StandingsRow row, String label) => switch (label) {
    'P' => '${row.played}',
    'W' => '${row.won}',
    'L' => '${row.lost}',
    'D' => '${row.drawn}',
    'PF' => '${row.pointsFor}',
    'PA' => '${row.pointsAgainst}',
    'Diff' =>
      row.pointsDifference > 0
          ? '+${row.pointsDifference}'
          : '${row.pointsDifference}',
    'BP' => '${row.bonusPoints}',
    _ => '${row.totalPoints}',
  };

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final showPools = standings.pools.length > 1;
    final updated = standings.lastUpdated;
    final header = textTheme.labelSmall;

    BoxDecoration rowDecoration(StandingsRow? row) => BoxDecoration(
      color: row == null
          ? Brand.muted
          : row.isClaymores
          ? Brand.pinkTint
          : Brand.background,
      border: const Border(bottom: BorderSide(color: Brand.divider)),
    );

    TextStyle? cellStyle(StandingsRow row, {bool strong = false}) =>
        textTheme.bodyMedium?.copyWith(
          fontFeatures: tabularFigures,
          fontWeight: row.isClaymores || strong
              ? FontWeight.w700
              : FontWeight.w400,
        );

    Widget cell(Widget child, {double width = 40, bool start = false}) =>
        SizedBox(
          width: width,
          height: _rowHeight,
          child: Align(
            alignment: start ? Alignment.centerLeft : Alignment.center,
            child: child,
          ),
        );

    /// One block of columns: a header row plus a row per team.
    Widget block(Widget Function(StandingsRow? row) build) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final row in <StandingsRow?>[null, ...standings.rows])
          Container(decoration: rowDecoration(row), child: build(row)),
      ],
    );

    // Pos and Team are pinned left and Pts pinned right; the other stats
    // scroll sideways on narrow screens.
    final left = block(
      (row) => Row(
        children: [
          cell(
            Text(
              row == null ? 'POS' : '${row.position}',
              style: row == null ? header : cellStyle(row),
            ),
            width: 40,
          ),
          cell(
            row == null
                ? Text('TEAM', style: header)
                : Row(
                    children: [
                      TeamLogo(name: row.teamName, size: 24),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TeamName(row.teamName, style: cellStyle(row)),
                            if (showPools && row.pool.isNotEmpty)
                              Text(row.pool, style: textTheme.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
            width: 176,
            start: true,
          ),
        ],
      ),
    );
    final stats = block(
      (row) => Row(
        children: [
          for (final (label, meaning, width) in _stats)
            cell(
              row == null
                  ? Tooltip(
                      message: meaning,
                      child: Text(label.toUpperCase(), style: header),
                    )
                  : Text(_stat(row, label), style: cellStyle(row)),
              width: width,
            ),
        ],
      ),
    );
    final points = block(
      (row) => cell(
        row == null
            ? Tooltip(
                message: 'Total points',
                child: Text('PTS', style: header),
              )
            : Text(_stat(row, 'Pts'), style: cellStyle(row, strong: true)),
        width: 48,
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Panel(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ColoredBox(
                color: Brand.pink,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Text(
                    [
                      if (standings.divisionName.isNotEmpty)
                        standings.divisionName.toUpperCase(),
                      standings.seasonLabel,
                    ].join(' · '),
                    style: const TextStyle(
                      fontFamily: Brand.display,
                      fontSize: 18,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  left,
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: stats,
                    ),
                  ),
                  DecoratedBox(
                    position: DecorationPosition.foreground,
                    decoration: const BoxDecoration(
                      border: Border(left: BorderSide(color: Brand.divider)),
                    ),
                    child: points,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          [
            'P played · W won · L lost · D drawn · PF/PA points for/against · '
                'BP bonus points · Pts total points',
            if (updated != null)
              'Updated ${MaterialLocalizations.of(context).formatMediumDate(updated.toLocal())}',
          ].join('\n'),
          style: textTheme.bodySmall,
        ),
      ],
    );
  }
}

class PlayoffList extends StatelessWidget {
  const PlayoffList({super.key, required this.standings});
  final Standings standings;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;

    Widget side(String team, int? score, bool won) => Container(
      color: won ? Brand.pinkTint : null,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          TeamLogo(name: team, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: TeamName(
              team,
              maxLines: null,
              overflow: null,
              style: TextStyle(
                fontWeight: won || isClaymoresTeam(team)
                    ? FontWeight.w700
                    : FontWeight.w400,
              ),
            ),
          ),
          Text(
            score?.toString() ?? '–',
            style: TextStyle(
              fontFeatures: tabularFigures,
              fontWeight: won ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final MapEntry(key: round, value: matches)
            in standings.playoffsByRound.entries) ...[
          Eyebrow(round.label),
          const SizedBox(height: 8),
          for (final match in matches)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Panel(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      color: Brand.muted,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Text(
                        [
                          if (match.label.isNotEmpty) match.label,
                          if (match.date != null)
                            localizations.formatMediumDate(match.date!),
                        ].join(' · '),
                        style: textTheme.bodySmall,
                      ),
                    ),
                    side(match.homeTeam, match.homeScore, match.homeWon),
                    const Divider(height: 1),
                    side(match.awayTeam, match.awayScore, match.awayWon),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 6),
        ],
      ],
    );
  }
}
