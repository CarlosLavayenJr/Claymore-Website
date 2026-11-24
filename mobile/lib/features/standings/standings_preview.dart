import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/standings_repository.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';

/// Home card: the top of the current table plus the Claymores row, from the
/// table the Standings tab shares. Hidden without an API or a table.
class StandingsPreview extends StatelessWidget {
  const StandingsPreview({super.key, this.top = 4});

  /// Rows shown from the top; Claymores is added below when lower.
  final int top;

  /// The rows to show: the first [top], then Claymores if it isn't among them.
  static List<StandingsRow> previewRows(Standings standings, int top) {
    final rows = standings.rows.take(top).toList();
    final us = standings.rows.where((row) => row.isClaymores).firstOrNull;
    if (us != null && !rows.contains(us)) rows.add(us);
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final controller = AppScope.of(context).standingsTable;
    if (!controller.available) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => FutureBuilder<Standings?>(
        future: controller.current,
        builder: (context, snapshot) {
          final Widget body;
          if (snapshot.connectionState != ConnectionState.done) {
            body = const Panel(
              child: SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              ),
            );
          } else if (snapshot.hasError) {
            body = StatusPanel(
              message: 'Couldn’t load the standings.',
              action: TextButton(
                onPressed: controller.reload,
                child: const Text('Retry'),
              ),
            );
          } else {
            final standings = snapshot.data;
            if (standings == null || standings.rows.isEmpty) {
              return const SizedBox.shrink();
            }
            body = _Card(
              standings: standings,
              rows: previewRows(standings, top),
            );
          }
          return Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [const SectionHeading('STANDINGS'), body],
            ),
          );
        },
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.standings, required this.rows});

  final Standings standings;
  final List<StandingsRow> rows;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final header = textTheme.labelSmall;

    Widget line({
      required Widget pos,
      required Widget team,
      required Widget played,
      required Widget points,
      StandingsRow? row,
      bool gapAbove = false,
    }) => Container(
      key: row == null ? null : ValueKey('preview-${row.position}'),
      decoration: BoxDecoration(
        color: row == null
            ? Brand.muted
            : row.isClaymores
            ? Brand.pinkTint
            : Brand.background,
        border: Border(
          top: gapAbove
              ? const BorderSide(color: Brand.divider, width: 3)
              : BorderSide.none,
          bottom: const BorderSide(color: Brand.divider),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      height: row == null ? 34 : 46,
      child: Row(
        children: [
          SizedBox(width: 32, child: pos),
          Expanded(child: team),
          SizedBox(width: 36, child: Center(child: played)),
          SizedBox(width: 44, child: Center(child: points)),
        ],
      ),
    );

    TextStyle? cell(StandingsRow row, {bool strong = false}) =>
        textTheme.bodyMedium?.copyWith(
          fontFeatures: tabularFigures,
          fontWeight: row.isClaymores || strong
              ? FontWeight.w700
              : FontWeight.w400,
        );

    final label = [
      if (standings.divisionName.isNotEmpty) standings.divisionName,
      if (standings.seasonLabel.isNotEmpty) 'Season ${standings.seasonLabel}',
    ].join(' · ');

    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Eyebrow(label),
          ),
          line(
            pos: Text('POS', style: header),
            team: Text('TEAM', style: header),
            played: Tooltip(
              message: 'Played',
              child: Text('P', style: header),
            ),
            points: Tooltip(
              message: 'Total points',
              child: Text('PTS', style: header),
            ),
          ),
          for (final (index, row) in rows.indexed)
            line(
              row: row,
              // A thicker rule when Claymores is shown below the top rows.
              gapAbove:
                  index > 0 && row.position > rows[index - 1].position + 1,
              pos: Text('${row.position}', style: cell(row)),
              team: Row(
                children: [
                  TeamLogo(name: row.teamName, size: 24),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      row.teamName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: cell(row),
                    ),
                  ),
                ],
              ),
              played: Text('${row.played}', style: cell(row)),
              points: Text(
                '${row.totalPoints}',
                style: cell(row, strong: true),
              ),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: TextButton.icon(
                onPressed: () => context.go('/standings'),
                iconAlignment: IconAlignment.end,
                icon: const Icon(Icons.arrow_forward, size: 18),
                label: const Text('Full table'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
