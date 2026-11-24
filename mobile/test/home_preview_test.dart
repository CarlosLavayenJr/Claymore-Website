import 'dart:convert';

import 'package:claymores/app/theme.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/standings_repository.dart';
import 'package:claymores/features/standings/standings_page.dart';
import 'package:claymores/main.dart';
import 'package:claymores/shared/team_logo.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class EmptyClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async =>
      ClubData('{"result":{"matches":[],"practice":null}}', isSnapshot: false);
}

Map<String, Object> row(int position, String team, int played, int points) => {
  'position': position,
  'teamName': team,
  'played': played,
  'totalPoints': points,
};

final table = jsonEncode({
  'seasonLabel': '2026-2027',
  'divisionName': 'Men Division 3',
  'rows': [
    row(1, 'Orlando Griffins RFC (D3)', 6, 26),
    row(2, 'Jacksonville RFC', 6, 22),
    row(3, 'Daytona Beach Coconuts RFC', 6, 18),
    row(4, 'Lakeland Lancers RFC', 6, 15),
    row(5, 'Sarasota Surge RFC', 6, 12),
    row(6, 'Central Florida Claymores RFC', 6, 10),
    row(7, 'Tallahassee', 6, 4),
  ],
});

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  Future<List<Uri>> pumpHome(
    WidgetTester tester,
    Future<http.Response> Function(http.Request) handler, {
    String apiBaseUrl = 'https://api.example.com',
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final requests = <Uri>[];
    await tester.pumpWidget(
      ClaymoresApp(
        repository: EmptyClubRepository(),
        standings: StandingsRepository(
          apiBaseUrl: apiBaseUrl,
          client: MockClient((request) {
            requests.add(request.url);
            return handler(request);
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return requests;
  }

  Future<http.Response> ok(http.Request request) async =>
      switch (request.url.path) {
        '/v1/standings' => http.Response.bytes(utf8.encode(table), 200),
        '/v1/standings/seasons' => http.Response('[]', 200),
        _ => http.Response('', 404),
      };

  testWidgets('shows the top four and the Claymores row with logos', (
    tester,
  ) async {
    final requests = await pumpHome(tester, ok);
    expect(find.text('STANDINGS'), findsOneWidget);
    // Pink banner: division on the left, season on the right.
    expect(find.text('Men Division 3'), findsOneWidget);
    expect(find.text('2026-2027'), findsOneWidget);
    expect(find.text('W'), findsOneWidget);
    // Scraped names show as the club's team names, like the website:
    // "Orlando Griffins RFC (D3)" is "Orlando Griffins".
    for (final team in [
      'Orlando Griffins',
      'Jacksonville Rugby',
      'Daytona Coconuts',
      'Lakeland Lancers',
      'Central Florida Claymores',
    ]) {
      expect(find.text(team), findsOneWidget, reason: team);
    }
    expect(find.text('Orlando Griffins RFC (D3)'), findsNothing);
    expect(find.text('Sarasota Rugby Club'), findsNothing);
    expect(find.text('Tallahassee Rugby'), findsNothing);

    final us = find.byKey(const ValueKey('preview-6'));
    final decoration =
        tester.widget<Container>(us).decoration! as BoxDecoration;
    expect(decoration.color, Brand.pinkTint);
    expect(
      find.descendant(of: us, matching: find.byType(TeamLogo)),
      findsOneWidget,
    );
    expect(find.descendant(of: us, matching: find.text('10')), findsOneWidget);

    // The Standings tab reuses the loaded table instead of fetching again.
    await tester.tap(find.text('Full table'));
    await tester.pumpAndSettle();
    expect(find.byType(LeagueTable), findsOneWidget);
    expect(requests.where((uri) => uri.path == '/v1/standings'), hasLength(1));
  });

  testWidgets('offers a retry when the table fails, shared with the tab', (
    tester,
  ) async {
    var fail = true;
    await pumpHome(
      tester,
      (request) async => fail ? http.Response('', 503) : ok(request),
    );
    expect(find.text('Couldn’t load the standings.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Jacksonville Rugby'), findsOneWidget);
  });

  testWidgets('is hidden without an API', (tester) async {
    await pumpHome(tester, ok, apiBaseUrl: '');
    expect(find.text('Full table'), findsNothing);
    expect(find.text('PRACTICE'), findsOneWidget);
  });

  testWidgets('is hidden when no table is published', (tester) async {
    await pumpHome(tester, (_) async => http.Response('', 404));
    expect(find.text('Full table'), findsNothing);
    expect(find.text('PRACTICE'), findsOneWidget);
    expect(find.text('Couldn’t load the standings.'), findsNothing);
  });
}
