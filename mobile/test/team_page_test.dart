import 'dart:convert';

import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/head_to_head.dart';
import 'package:claymores/data/standings_repository.dart';
import 'package:claymores/data/teams.dart';
import 'package:claymores/features/club/club_page.dart';
import 'package:claymores/features/fixtures/fixture_card.dart';
import 'package:claymores/features/teams/team_page.dart';
import 'package:claymores/main.dart';
import 'package:claymores/shared/team_link.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

Map<String, Object?> match(
  String id,
  String date,
  String home,
  String away,
  String status, {
  int? homeScore,
  int? awayScore,
  int? season,
  String? competition,
}) => {
  '_id': id,
  'date': date,
  'season': ?season,
  'homeTeam': home,
  'awayTeam': away,
  'status': status,
  'homeScore': ?homeScore,
  'awayScore': ?awayScore,
  'competition': ?competition,
};

/// Lakeland under three of its scraped names, plus fixtures that must not
/// count: another club and the Highland Games.
final matches = [
  match(
    'won',
    '2024-03-02',
    'Claymores',
    'Lakeland',
    'played',
    homeScore: 20,
    awayScore: 10,
    season: 2024,
    competition: 'Florida Rugby Union D3',
  ),
  match(
    'drew',
    '2025-01-11',
    'Lakeland Lancers RFC',
    'Claymores',
    'played',
    homeScore: 12,
    awayScore: 12,
    season: 2025,
  ),
  match(
    'lost',
    '2025-10-04',
    'Lakeland Lancers',
    'Central Florida Claymores RFC',
    'played',
    homeScore: 24,
    awayScore: 7,
    season: 2026,
  ),
  match(
    'forfeit',
    '2026-02-07',
    'Claymores',
    'Lakeland',
    'forfeit_them',
    season: 2026,
  ),
  match(
    'cancelled',
    '2026-03-07',
    'Lakeland',
    'Claymores',
    'cancelled',
    season: 2026,
  ),
  match(
    'next',
    '2099-02-07',
    'Claymores',
    'Lakeland',
    'upcoming',
    season: 2099,
  ),
  match(
    'daytona',
    '2025-02-01',
    'Claymores',
    'Daytona',
    'played',
    homeScore: 50,
    awayScore: 0,
    season: 2025,
  ),
  match(
    'highland',
    '2026-01-16',
    'Claymores',
    'Claymores',
    'played',
    season: 2026,
    competition: 'Annual Highland games',
  ),
];

class TestClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async => ClubData(
    jsonEncode({
      'result': {'matches': matches, 'practice': null},
    }),
    isSnapshot: false,
  );
}

const lakeland = Team(name: 'Lakeland Lancers', slug: 'lakeland-lancers');

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('head-to-head record matches the website opponent page', () {
    final fixtures = parseFixtures(matches);
    final record = HeadToHead.compute(
      lakeland,
      fixtures,
      TeamResolver(TeamDirectory.bundledTeams).resolve,
    );

    // Newest first; Daytona and the club event are not Lakeland fixtures.
    expect(record.matches.map((m) => m.fixture.id), [
      'next',
      'cancelled',
      'forfeit',
      'lost',
      'drew',
      'won',
    ]);
    expect(record.matches.map((m) => m.result), [
      'UP',
      '—',
      'W',
      'L',
      'D',
      'W',
    ]);
    // A forfeit counts 20–0; upcoming and cancelled are not counted.
    expect(record.wins, 2);
    expect(record.losses, 1);
    expect(record.draws, 1);
    expect(record.played, 4);
    expect(record.pointsFor, 20 + 12 + 7 + 20);
    expect(record.pointsAgainst, 10 + 12 + 24);

    final drew = record.matches.firstWhere((m) => m.fixture.id == 'drew');
    expect(drew.home, isFalse);
    expect(drew.detail, '2024-25 · Away');
    final won = record.matches.last;
    expect(won.detail, '2023-24 · Home · Florida Rugby Union D3');
    expect((won.ours, won.theirs), (20, 10));
  });

  Future<void> pumpApp(
    WidgetTester tester, {
    StandingsRepository? standings,
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ClaymoresApp(
        repository: TestClubRepository(),
        teams: TeamDirectory.bundled(),
        standings: standings,
        playIntro: false,
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a fixture card opens the team page; the card body the match', (
    tester,
  ) async {
    await pumpApp(tester);
    expect(find.text('VS LAKELAND'), findsOneWidget);

    // The opponent's crest and name open its team page.
    final lakelandLink = find.bySemanticsLabel('Lakeland Lancers, team page');
    expect(lakelandLink, findsOneWidget);
    expect(tester.getSize(lakelandLink).height, greaterThanOrEqualTo(44));
    await tester.tap(lakelandLink);
    await tester.pumpAndSettle();

    expect(find.byType(TeamPage), findsOneWidget);
    expect(find.text('FLORIDA RUGBY UNION OPPONENT'), findsOneWidget);
    expect(
      find.text('LAKELAND LANCERS VS CENTRAL FLORIDA CLAYMORES RFC'),
      findsOneWidget,
    );
    expect(
      find.text('ALL-TIME RESULTS VS LAKELAND LANCERS (4 PLAYED)'),
      findsOneWidget,
    );
    String stat(String label) =>
        tester.widget<Text>(find.byKey(ValueKey('stat-$label'))).data!;
    expect(['WINS', 'LOSSES', 'DRAWS', 'PF', 'PA'].map(stat), [
      '2',
      '1',
      '1',
      '59',
      '46',
    ]);
    expect(find.text('UP'), findsOneWidget);
    expect(find.text('7–24'), findsOneWidget);

    // A result row opens the match.
    final lostRow = find.byKey(const ValueKey('h2h-lost'));
    await tester.ensureVisible(lostRow);
    await tester.pumpAndSettle();
    await tester.tap(lostRow);
    await tester.pumpAndSettle();
    expect(find.text('MATCH DETAILS'), findsOneWidget);
    expect(find.text('24–7'), findsOneWidget);

    // Back to Home: tapping the card body still opens the match.
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('VS LAKELAND'));
    await tester.pumpAndSettle();
    expect(find.text('MATCH DETAILS'), findsOneWidget);
    expect(find.byType(TeamPage), findsNothing);

    // The match header's teams are links too.
    await tester.tap(find.bySemanticsLabel('Lakeland Lancers, team page'));
    await tester.pumpAndSettle();
    expect(find.byType(TeamPage), findsOneWidget);
  });

  testWidgets('tapping the Claymores opens the Club tab', (tester) async {
    await pumpApp(tester);
    final us = find.bySemanticsLabel('Central Florida Claymores, club page');
    expect(us, findsOneWidget);
    await tester.tap(us);
    await tester.pumpAndSettle();
    expect(find.byType(ClubPage), findsOneWidget);
    expect(find.byType(TeamPage), findsNothing);
  });

  testWidgets('the club event is not a team link', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('Fixtures'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    final event = find.ancestor(
      of: find.text('ANNUAL HIGHLAND GAMES'),
      matching: find.byType(FixtureCard),
    );
    expect(event, findsOneWidget);
    expect(
      find.descendant(of: event, matching: find.byType(TeamLink)),
      findsNothing,
    );
  });

  testWidgets('a standings row opens the team page', (tester) async {
    final table = jsonEncode({
      'seasonLabel': '2026-2027',
      'divisionName': 'Men Division 3',
      'rows': [
        {'position': 1, 'teamName': 'Orlando Griffins RFC (D3)'},
        {'position': 2, 'teamName': 'Lakeland Lancers RFC'},
        {'position': 3, 'teamName': 'Central Florida Claymores RFC'},
      ],
    });
    await pumpApp(
      tester,
      standings: StandingsRepository(
        apiBaseUrl: 'https://api.example.com',
        client: MockClient(
          (request) async => switch (request.url.path) {
            '/v1/standings' => http.Response.bytes(utf8.encode(table), 200),
            '/v1/standings/seasons' => http.Response('[]', 200),
            _ => http.Response('', 404),
          },
        ),
      ),
    );
    await tester.tap(find.text('Standings'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('team-2')));
    await tester.pumpAndSettle();
    expect(find.byType(TeamPage), findsOneWidget);
    expect(
      find.text('ALL-TIME RESULTS VS LAKELAND LANCERS (4 PLAYED)'),
      findsOneWidget,
    );
  });
}
