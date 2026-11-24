import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../data/club_time.dart';
import '../../shared/widgets.dart';
import '../fixtures/club_data_view.dart';
import '../fixtures/fixture_card.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final preview = AppScope.of(context).playerPreview;
    return ValueListenableBuilder(
      valueListenable: preview,
      builder: (context, playerPreview, _) => ClubDataView(
        storageKey: 'home',
        builder: (context, clubData) {
          final today = clubToday();
          final next = clubData.fixtures
              .where(
                (fixture) =>
                    fixture.status == 'upcoming' &&
                    !fixture.date.isBefore(today),
              )
              .firstOrNull;
          final practice = clubData.practice;
          return [
            const SectionHeading('NEXT MATCH'),
            if (next == null)
              const Panel(child: Text('No upcoming match is listed.'))
            else
              FixtureCard(
                key: ValueKey(next.id),
                fixture: next,
                availability: playerPreview,
                featured: true,
              ),
            const SizedBox(height: 24),
            const SectionHeading('PRACTICE'),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${practice.weekday} · ${practice.time}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  Text(practice.venue),
                  Text(
                    practice.address,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 8),
                  Text(practice.note),
                  DirectionsButton(venue: practice.address),
                ],
              ),
            ),
          ];
        },
      ),
    );
  }
}
