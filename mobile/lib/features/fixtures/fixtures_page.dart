import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../data/club_time.dart';
import '../../shared/widgets.dart';
import 'club_data_view.dart';
import 'fixture_card.dart';

class FixturesPage extends StatefulWidget {
  const FixturesPage({super.key});

  @override
  State<FixturesPage> createState() => _FixturesPageState();
}

class _FixturesPageState extends State<FixturesPage> {
  bool history = false;
  int? season;

  @override
  Widget build(BuildContext context) {
    final preview = AppScope.of(context).showAvailability;
    return ValueListenableBuilder(
      valueListenable: preview,
      builder: (context, showAvailability, _) => ClubDataView(
        storageKey: 'fixtures',
        builder: (context, clubData) {
          final today = clubToday();
          final past = clubData.fixtures
              .where((f) => f.date.isBefore(today))
              .toList();
          final seasons = past.map((f) => f.season).nonNulls.toSet().toList()
            ..sort((a, b) => b.compareTo(a));
          final selectedSeason = seasons.contains(season) ? season : null;
          final visible = history
              ? past.reversed.where(
                  (f) => selectedSeason == null || f.season == selectedSeason,
                )
              : clubData.fixtures.where((f) => !f.date.isBefore(today));
          return [
            const SectionHeading('FIXTURES'),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Upcoming')),
                ButtonSegment(value: true, label: Text('History')),
              ],
              selected: {history},
              onSelectionChanged: (values) =>
                  setState(() => history = values.single),
            ),
            const SizedBox(height: 14),
            if (history)
              DropdownButton<int>(
                isExpanded: true,
                value: selectedSeason ?? 0,
                items: [
                  const DropdownMenuItem(value: 0, child: Text('All seasons')),
                  for (final year in seasons)
                    DropdownMenuItem(value: year, child: Text('Season $year')),
                ],
                onChanged: (value) =>
                    setState(() => season = value == 0 ? null : value),
              ),
            if (visible.isEmpty)
              Panel(
                child: Text(
                  history
                      ? 'No past fixtures listed.'
                      : 'No upcoming fixtures listed.',
                ),
              ),
            for (final fixture in visible)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: FixtureCard(
                  key: ValueKey(fixture.id),
                  fixture: fixture,
                  availability:
                      showAvailability &&
                      !history &&
                      fixture.status == 'upcoming',
                ),
              ),
          ];
        },
      ),
    );
  }
}
