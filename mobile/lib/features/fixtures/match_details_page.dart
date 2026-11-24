import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../data/club_repository.dart';
import '../../data/club_time.dart';
import '../../shared/widgets.dart';
import 'availability.dart';
import 'fixture_card.dart';

/// `/match/:id`. Uses the fixture passed by the card, or finds it in the
/// loaded schedule when opened directly (web reload, deep link).
class MatchDetailsPage extends StatelessWidget {
  const MatchDetailsPage({super.key, required this.id, this.fixture});

  final String id;
  final Fixture? fixture;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('MATCH DETAILS')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: fixture != null
              ? _Details(fixture: fixture!)
              : FutureBuilder<ClubData>(
                  future: services.club.data,
                  builder: (context, snapshot) {
                    if (!snapshot.hasData && !snapshot.hasError) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final match = snapshot.data?.fixtures
                        .where((f) => f.id == id)
                        .firstOrNull;
                    return match == null
                        ? const PageList(
                            children: [
                              StatusPanel(message: 'This match isn’t listed.'),
                            ],
                          )
                        : _Details(fixture: match);
                  },
                ),
        ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.fixture});
  final Fixture fixture;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final preview = AppScope.of(context).showAvailability;
    final upcoming =
        fixture.status == 'upcoming' && !fixture.date.isBefore(clubToday());
    return ValueListenableBuilder(
      valueListenable: preview,
      builder: (context, showAvailability, _) => PageList(
        children: [
          Eyebrow(localizations.formatFullDate(fixture.date)),
          const SizedBox(height: 12),
          Panel(
            featured: true,
            child: FixtureMatchup(fixture: fixture, logoSize: 64),
          ),
          const SizedBox(height: 24),
          const SectionHeading('GAME INFO'),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (fixture.season != null) Text('Season ${fixture.season}'),
                if (fixture.status == 'upcoming')
                  Text(
                    fixture.kickoff.isEmpty
                        ? 'Kickoff to be announced'
                        : 'Kickoff ${fixture.kickoff}',
                  ),
                if (fixture.venue.isNotEmpty)
                  Text(fixture.venue)
                else if (fixture.status == 'upcoming')
                  const Text('Venue to be announced'),
                if (fixture.note.isNotEmpty)
                  Text(
                    fixture.note,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (fixture.venue.isNotEmpty)
                  DirectionsButton(venue: fixture.venue),
              ],
            ),
          ),
          if (showAvailability && upcoming) ...[
            const SizedBox(height: 12),
            Panel(child: AvailabilityPicker(fixtureId: fixture.id)),
          ],
        ],
      ),
    );
  }
}
