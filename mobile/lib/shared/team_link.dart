import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../app/deep_links.dart';
import '../data/teams.dart';
import 'team_logo.dart';

/// `/team/:slug`, the app's version of the website's `/opponents/[slug]`.
String teamLocation(String slug) => '/team/${Uri.encodeComponent(slug)}';

/// Makes a team's crest and/or name ([child]) open its team page, like the
/// website's opponent links. The Claymores open the Club tab instead. Names
/// that match no known team (and so have no page) render [child] as is.
///
/// The tap target is at least 44×44 and sits inside any outer card's own
/// [InkWell], so a tap here opens the team while a tap elsewhere on the card
/// still does the card's action. Screen readers hear "Lakeland Lancers, team page".
class TeamLink extends StatelessWidget {
  const TeamLink({
    super.key,
    required this.name,
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(6)),
  });

  /// The raw fixture or standings name ("Lakeland", "Jacksonville D3").
  final String name;
  final Widget child;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) {
    final directory = teamDirectoryOf(context);
    return ListenableBuilder(
      listenable: directory,
      builder: (context, _) {
        final team = directory.resolve(name);
        final display = TeamName.display(name, team);
        final VoidCallback onTap;
        final String label;
        if (team?.isClaymores ?? TeamResolver.isClaymores(name)) {
          onTap = () => context.go(clubPath);
          label = '$display, club page';
        } else if (team != null && team.slug.isNotEmpty) {
          onTap = () => context.push(teamLocation(team.slug));
          label = '$display, team page';
        } else {
          return child;
        }
        return Semantics(
          container: true,
          button: true,
          label: label,
          onTap: onTap,
          excludeSemantics: true,
          child: InkWell(
            onTap: onTap,
            borderRadius: borderRadius,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
              child: child,
            ),
          ),
        );
      },
    );
  }
}
