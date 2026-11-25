import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../data/club_repository.dart';
import '../../shared/widgets.dart';
import '../admin/admin_page.dart';
import 'availability.dart';
import 'fixture_card.dart';
import 'lineup.dart';

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

/// Game info for everyone; for signed-in members of an upcoming Claymores
/// match "CAN YOU PLAY?", the published lineup, and for admins the squad's
/// answers and the lineup editor.
class _Details extends StatefulWidget {
  const _Details({required this.fixture});
  final Fixture fixture;

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  /// Bumped after the lineup editor closes, to reload the lineup.
  int lineupVersion = 0;

  @override
  Widget build(BuildContext context) {
    final fixture = widget.fixture;
    final localizations = MaterialLocalizations.of(context);
    final services = AppScope.of(context);
    final gate = services.showAvailability;
    return ListenableBuilder(
      listenable: Listenable.merge([gate, services.auth]),
      builder: (context, _) {
        final auth = services.auth;
        final user = auth.user;
        final members = services.members;
        final admin = services.admin;
        final memberView =
            gate.value &&
            members != null &&
            user != null &&
            !fixture.isClubEvent;
        return PageList(
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
            if (takesAvailability(fixture)) ...[
              // Coaches don't play, so they aren't asked.
              if (memberView && user.plays) ...[
                const SizedBox(height: 24),
                MatchAvailabilityPanel(
                  key: ValueKey('availability-${user.subject}'),
                  fixtureId: fixture.id,
                  members: members,
                ),
              ] else if (gate.enabled && auth.enabled && !auth.signedIn) ...[
                const SizedBox(height: 24),
                const AvailabilitySignInPrompt(),
              ],
            ],
            if (memberView)
              MatchLineupSection(
                key: ValueKey('lineup-${user.subject}-$lineupVersion'),
                fixtureId: fixture.id,
                members: members,
                me: user.subject,
              ),
            if (memberView && admin != null && isClubAdmin(user))
              MatchAdminSection(
                key: ValueKey('admin-${user.subject}'),
                fixture: fixture,
                admin: admin,
                canEdit: user.canPickLineups,
                onLineupChanged: () => setState(() => lineupVersion++),
              ),
          ],
        );
      },
    );
  }
}
