import 'package:material_ui/material_ui.dart';

import '../app/services.dart';
import '../app/theme.dart';
import '../data/teams.dart';

/// A club's logo for a raw fixture or standings name ("Jacksonville D3",
/// "Orlando Griffins RFC (D3)").
///
/// Order: the club crest for Claymores; otherwise the team's Sanity logo
/// (or [url], e.g. a fixture's `homeLogo`), shown over the bundled logo while
/// it loads and replaced by it on error; then a monogram circle.
class TeamLogo extends StatelessWidget {
  const TeamLogo({super.key, required this.name, this.url, this.size = 36});

  final String name;
  final String? url;
  final double size;

  static final _fallbackDirectory = TeamDirectory.bundled();

  @override
  Widget build(BuildContext context) {
    final directory = AppScope.maybeOf(context)?.teams ?? _fallbackDirectory;
    return ListenableBuilder(
      listenable: directory,
      builder: (context, _) => _build(directory.resolve(name)),
    );
  }

  Widget _build(Team? team) {
    final Widget offline = switch (team?.asset) {
      final asset? => Image.asset(
        asset,
        width: size,
        height: size,
        fit: BoxFit.contain,
        excludeFromSemantics: true,
        errorBuilder: (_, _, _) => TeamMonogram(name: name, size: size),
      ),
      null => TeamMonogram(name: name, size: size),
    };
    final network = (team?.isClaymores ?? TeamResolver.isClaymores(name))
        ? null
        : team?.logoUrl ?? sanityLogo(url);
    return SizedBox.square(
      dimension: size,
      child: network == null
          ? offline
          : Image.network(
              network,
              key: ValueKey(network),
              width: size,
              height: size,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
              // Sanity rejects CORS requests from origins it doesn't list, so
              // on the web let the browser show it with a plain <img>.
              webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
              frameBuilder: (context, child, frame, synchronous) =>
                  frame == null && !synchronous ? offline : child,
              errorBuilder: (_, _, _) => offline,
            ),
    );
  }
}

/// Initials in a tinted circle, for clubs without a logo.
class TeamMonogram extends StatelessWidget {
  const TeamMonogram({super.key, required this.name, this.size = 36});

  final String name;
  final double size;

  static String initials(String name) {
    final words = TeamResolver.normalize(name)
        .split(' ')
        .where((word) => word.isNotEmpty)
        .toList();
    if (words.isEmpty) return '?';
    if (words.length == 1) {
      final word = words.single;
      return (word.length <= 3 ? word : word.substring(0, 2)).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: const BoxDecoration(
      color: Brand.blueTint,
      shape: BoxShape.circle,
      border: Border.fromBorderSide(BorderSide(color: Brand.blueBorder)),
    ),
    child: ExcludeSemantics(
      child: Text(
        initials(name),
        maxLines: 1,
        style: displayStyle(size * 0.36),
      ),
    ),
  );
}
