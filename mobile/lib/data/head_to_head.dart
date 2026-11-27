import 'models/club.dart';
import 'teams.dart';
import '../shared/formats.dart' as formats;

/// One fixture against an opponent, from the Claymores' point of view.
class HeadToHeadMatch {
  HeadToHeadMatch(this.fixture) : home = TeamResolver.isClaymores(fixture.home);

  final Fixture fixture;

  /// True when the Claymores were the home side.
  final bool home;

  int? get ours => home ? fixture.homeScore : fixture.awayScore;
  int? get theirs => home ? fixture.awayScore : fixture.homeScore;

  /// Scored and counted in the record ("31–5" on the row).
  bool get scored =>
      fixture.status == 'played' && ours != null && theirs != null;

  /// "W", "L", "D", "UP" (upcoming) or "—" (cancelled, unscored, unknown),
  /// as on the website's opponent page. Forfeits count as a win or loss.
  String get result => switch (fixture.status) {
    'upcoming' => 'UP',
    'forfeit_us' => 'L',
    'forfeit_them' => 'W',
    'played' when scored =>
      ours! > theirs!
          ? 'W'
          : ours! < theirs!
          ? 'L'
          : 'D',
    _ => '—',
  };

  /// "2025-26", the website's season label, or null without a season.
  String? get seasonLabel => switch (fixture.season) {
    final season? => formats.seasonLabel(season),
    null => null,
  };

  /// "2025-26 · Home · Florida Rugby Union D3".
  String get detail => [
    ?seasonLabel,
    home ? 'Home' : 'Away',
    if (fixture.competition.isNotEmpty) fixture.competition,
  ].join(' · ');
}

/// The all-time record against [team], computed the way the website's
/// `/opponents/[slug]` page does: forfeits count 20–0, upcoming and cancelled
/// fixtures are listed but not counted, and matches are newest first.
class HeadToHead {
  HeadToHead._(this.team, this.matches);

  /// Fixtures between the Claymores and [team], matched by resolving each
  /// side's raw name with [resolve] (the app's [TeamDirectory]). Club events
  /// (Claymores vs Claymores) never count.
  factory HeadToHead.compute(
    Team team,
    Iterable<Fixture> fixtures,
    Team? Function(String name) resolve,
  ) {
    bool isTeam(String name) =>
        !TeamResolver.isClaymores(name) && resolve(name)?.slug == team.slug;
    final matches = [
      for (final fixture in fixtures)
        if (TeamResolver.isClaymores(fixture.home) !=
                TeamResolver.isClaymores(fixture.away) &&
            (isTeam(fixture.home) || isTeam(fixture.away)))
          HeadToHeadMatch(fixture),
    ]..sort((a, b) => b.fixture.date.compareTo(a.fixture.date));
    return HeadToHead._(team, List.unmodifiable(matches));
  }

  final Team team;
  final List<HeadToHeadMatch> matches;

  late final int wins = _count('W');
  late final int losses = _count('L');
  late final int draws = _count('D');
  int get played => wins + losses + draws;

  late final int pointsFor = matches.fold(
    0,
    (sum, m) =>
        sum +
        switch (m.fixture.status) {
          'forfeit_them' => 20,
          _ when m.scored => m.ours!,
          _ => 0,
        },
  );

  late final int pointsAgainst = matches.fold(
    0,
    (sum, m) =>
        sum +
        switch (m.fixture.status) {
          'forfeit_us' => 20,
          _ when m.scored => m.theirs!,
          _ => 0,
        },
  );

  int _count(String result) => matches.where((m) => m.result == result).length;
}
