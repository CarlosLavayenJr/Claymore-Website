import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/club_repository.dart';
import '../../shared/team_logo.dart';
import '../../shared/widgets.dart';
import 'availability.dart';

String matchLocation(Fixture fixture) =>
    '/match/${Uri.encodeComponent(fixture.id)}';

class FixtureCard extends StatelessWidget {
  const FixtureCard({
    super.key,
    required this.fixture,
    required this.availability,
    this.featured = false,
  });

  final Fixture fixture;
  final bool availability, featured;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final date =
        '${localizations.formatMediumDate(fixture.date)}, ${fixture.date.year}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Eyebrow(date),
        const SizedBox(height: 8),
        Panel(
          featured: featured,
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              Semantics(
                button: true,
                label: fixture.title,
                child: InkWell(
                  onTap: () =>
                      context.push(matchLocation(fixture), extra: fixture),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    child: FixtureMatchup(fixture: fixture),
                  ),
                ),
              ),
              if (availability)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  child: AvailabilityPicker(fixtureId: fixture.id),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class FixtureMatchup extends StatelessWidget {
  const FixtureMatchup({super.key, required this.fixture, this.logoSize = 40});
  final Fixture fixture;
  final double logoSize;

  @override
  Widget build(BuildContext context) {
    final opponent = fixture.home.trim().toLowerCase() == 'claymores'
        ? fixture.away
        : fixture.home;
    final isUpcoming = fixture.status == 'upcoming';
    final isPlayed = fixture.status == 'played';
    return Row(
      children: [
        Expanded(
          child: FixtureTeam(
            name: fixture.home,
            logo: fixture.homeLogo,
            logoSize: logoSize,
          ),
        ),
        Expanded(
          flex: 2,
          child: Column(
            children: [
              Text(
                isPlayed ? fixture.statusLabel : 'VS ${opponent.toUpperCase()}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFeatures: isPlayed ? tabularFigures : null,
                  fontSize: isPlayed ? 18 : 12,
                  color: Brand.ink,
                  fontWeight: FontWeight.w700,
                  letterSpacing: isPlayed ? 0 : 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 5,
                runSpacing: 4,
                children: [
                  FixtureBadge(
                    label: isUpcoming
                        ? 'Upcoming'
                        : isPlayed
                        ? 'Final'
                        : fixture.statusLabel,
                  ),
                  if (fixture.matchType == 'friendly')
                    const FixtureBadge(label: 'FRIENDLY', accent: true),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: FixtureTeam(
            name: fixture.away,
            logo: fixture.awayLogo,
            logoSize: logoSize,
          ),
        ),
      ],
    );
  }
}

class FixtureTeam extends StatelessWidget {
  const FixtureTeam({
    super.key,
    required this.name,
    required this.logo,
    this.logoSize = 40,
  });
  final String name;
  final String? logo;
  final double logoSize;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: TeamLogo(name: name, url: logo, size: logoSize),
      ),
      const SizedBox(height: 4),
      Text(
        name,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ],
  );
}

/// Status pill: blue tint for match status, pink tint for accents.
class FixtureBadge extends StatelessWidget {
  const FixtureBadge({super.key, required this.label, this.accent = false});
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: accent ? Brand.pinkTint : Brand.blueTint,
      border: Border.all(color: accent ? Brand.pinkBorder : Brand.blueBorder),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Text(
      label,
      textAlign: TextAlign.center,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: Brand.ink,
      ),
    ),
  );
}
