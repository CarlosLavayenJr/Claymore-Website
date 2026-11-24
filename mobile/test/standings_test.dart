import 'dart:convert';
import 'dart:io';

import 'package:claymores/app/theme.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/standings_repository.dart';
import 'package:claymores/features/standings/standings_page.dart';
import 'package:claymores/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

/// Captured from the local API (GET /v1/standings, ?season=2025-2026 and
/// /v1/standings/seasons) on 23 Nov 2026.
String fixture(String name) => File('test/fixtures/$name').readAsStringSync();

class EmptyClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async =>
      ClubData('{"result":{"matches":[],"practice":null}}', isSnapshot: false);
}

http.Response json(String body) => http.Response.bytes(
  utf8.encode(body),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Future<http.Response> standingsHandler(http.Request request) async {
  final season = request.url.queryParameters['season'];
  return switch ((request.url.path, season)) {
    ('/v1/standings/seasons', _) => json(fixture('standings_seasons.json')),
    ('/v1/standings', null) => json(fixture('standings_current.json')),
    ('/v1/standings', '2025-2026') => json(fixture('standings_2025-2026.json')),
    ('/v1/standings', _) => http.Response('', 404),
    _ => http.Response('', 500),
  };
}

MockClient standingsApi({List<Uri>? requests}) => MockClient((request) {
  requests?.add(request.url);
  return standingsHandler(request);
});

void main() {
  group('parsing real API JSON', () {
    test('current season: zeroed table, mixed pools, no playoffs', () {
      final standings = Standings.fromJson(
        jsonDecode(fixture('standings_current.json')) as Map<String, dynamic>,
      );
      expect(standings.seasonLabel, '2026-2027');
      expect(standings.divisionName, 'Men Division 3');
      expect(standings.rows, hasLength(10));
      expect(standings.playoffs, isEmpty);
      expect(standings.pools, ['Pool B', 'Pool A']);
      final us = standings.rows.singleWhere((row) => row.isClaymores);
      expect(us.position, 2);
      expect(us.teamName, 'Central Florida Claymores RFC');
      expect(standings.lastUpdated, DateTime.utc(2026, 11, 2, 11, 0, 10, 443));
    });

    test('2025-2026: full stats and playoffs grouped by round', () {
      final standings = Standings.fromJson(
        jsonDecode(fixture('standings_2025-2026.json')) as Map<String, dynamic>,
      );
      expect(standings.rows, hasLength(14));
      final top = standings.rows.first;
      expect(
        [
          top.position,
          top.played,
          top.won,
          top.lost,
          top.drawn,
          top.pointsFor,
          top.pointsAgainst,
          top.pointsDifference,
          top.bonusPoints,
          top.totalPoints,
        ],
        [1, 5, 5, 0, 0, 321, 96, 225, 0, 20],
      );
      expect(standings.rows.singleWhere((r) => r.isClaymores).position, 8);

      final rounds = standings.playoffsByRound;
      expect(rounds.keys, [
        PlayoffRound.quarter,
        PlayoffRound.semi,
        PlayoffRound.finals,
      ]);
      expect(rounds[PlayoffRound.quarter], hasLength(2));
      expect(rounds[PlayoffRound.semi], hasLength(4));
      expect(rounds[PlayoffRound.finals], hasLength(3));
      final stateFinal = rounds[PlayoffRound.finals]!.first;
      expect(stateFinal.label, 'State Final');
      expect(stateFinal.homeWon, isTrue);
      expect(stateFinal.date, DateTime(2026, 4, 11));
    });

    test('seasons list', () {
      final seasons = StandingsSeason.listFromJson(
        jsonDecode(fixture('standings_seasons.json')),
      );
      expect(seasons.map((s) => s.seasonLabel), [
        '2026-2027',
        '2025-2026',
        '2024-2025',
        '2023-2024',
        '2022-2023',
      ]);
      expect(seasons.last.divisionName, 'Men Division 4');
      expect(seasons.first.claymoresPosition, 2);
    });

    test('missing and malformed fields fall back instead of throwing', () {
      final standings = Standings.fromJson({
        'rows': [
          {'teamName': 'Claymores', 'pointsFor': 10, 'pointsAgainst': 3},
          {'position': 'x'},
          'junk',
        ],
        'playoffs': null,
      });
      expect(standings.rows.single.pointsDifference, 7);
      expect(standings.seasonLabel, isEmpty);
      expect(standings.playoffs, isEmpty);
    });
  });

  group('repository', () {
    test('passes ?season= and treats 404 as no table', () async {
      final requests = <Uri>[];
      final repo = StandingsRepository(
        apiBaseUrl: 'https://api.example.com/',
        client: standingsApi(requests: requests),
      );
      expect((await repo.standings(season: '2025-2026'))!.rows, hasLength(14));
      expect(await repo.standings(season: '1999-2000'), isNull);
      expect(
        requests.first.toString(),
        'https://api.example.com/v1/standings?season=2025-2026',
      );
    });

    test('without an API base URL it is unavailable', () {
      final repo = StandingsRepository(apiBaseUrl: '');
      expect(repo.available, isFalse);
      expect(repo.standings(), throwsA(isA<StandingsUnavailable>()));
    });
  });

  group('Standings tab', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    Future<void> openStandings(
      WidgetTester tester,
      StandingsRepository repo,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ClaymoresApp(repository: EmptyClubRepository(), standings: repo),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Standings'));
      await tester.pumpAndSettle();
    }

    testWidgets('explains that standings need the API when none is set', (
      tester,
    ) async {
      await openStandings(tester, StandingsRepository(apiBaseUrl: ''));
      expect(find.text('Standings need the club API.'), findsOneWidget);
    });

    testWidgets('shows the table, highlights Claymores and switches season', (
      tester,
    ) async {
      await openStandings(
        tester,
        StandingsRepository(
          apiBaseUrl: 'https://api.example.com',
          client: standingsApi(),
        ),
      );
      expect(find.text('MEN DIVISION 3 · 2026-2027'), findsOneWidget);
      final us = find.text('Central Florida Claymores');
      expect(us, findsOneWidget);
      final row = tester.widget<Container>(
        find.ancestor(of: us, matching: find.byType(Container)).first,
      );
      expect((row.decoration! as BoxDecoration).color, Brand.pinkTint);
      expect(find.text('PLAYOFFS'), findsNothing);

      await tester.tap(find.text('Season 2026-2027'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Season 2025-2026').last);
      await tester.pumpAndSettle();
      expect(find.text('MEN DIVISION 3 · 2025-2026'), findsOneWidget);
      expect(find.text('+225'), findsOneWidget);
      final page = find
          .descendant(
            of: find.byType(StandingsPage),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('PLAYOFFS'),
        300,
        scrollable: page,
      );
      expect(find.text('PLAYOFFS'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Season 2025-2026'),
        -300,
        scrollable: page,
      );

      await tester.tap(find.text('Season 2025-2026'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Season 2024-2025').last);
      await tester.pumpAndSettle();
      expect(find.text('Standings TBD.'), findsOneWidget);
    });

    testWidgets('offers a retry when the API fails', (tester) async {
      var fail = true;
      final client = MockClient((request) async {
        if (fail) return http.Response('', 503);
        return standingsHandler(request);
      });
      await openStandings(
        tester,
        StandingsRepository(
          apiBaseUrl: 'https://api.example.com',
          client: client,
        ),
      );
      expect(find.text('Couldn’t load the standings.'), findsOneWidget);
      fail = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Central Florida Claymores'), findsOneWidget);
    });
  });
}
