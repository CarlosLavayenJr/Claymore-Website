import 'dart:async';
import 'dart:convert';

import 'package:claymores/app/services.dart';
import 'package:claymores/app/theme.dart';
import 'package:claymores/data/admin_repository.dart';
import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/data/standings_repository.dart';
import 'package:claymores/data/teams.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/fixtures/fixture_card.dart';
import 'package:claymores/features/club/upcoming_matches.dart';
import 'package:claymores/features/fixtures/match_details_page.dart';
import 'package:claymores/features/home/home_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

final base = ApiBase.tryParse('https://api.example.com')!;

const matchJson = {
  '_id': 'm1',
  'date': '2099-02-07',
  'season': 2099,
  'homeTeam': 'Claymores',
  'awayTeam': 'Daytona',
  'status': 'upcoming',
};

final match = Fixture(matchJson);

class OneMatchRepository extends ClubRepository {
  @override
  Future<ClubData> load() async => ClubData(
    jsonEncode({
      'result': {
        'matches': [matchJson],
        'practice': null,
      },
    }),
    isSnapshot: false,
  );
}

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;
  @override
  Future<String?> idToken() async => 'google-id-token';
  @override
  Future<void> signOut() async {}
}

String session(String role) => jsonEncode({
  'accessToken': 'access-1',
  'accessTokenExpiresAt': DateTime.now()
      .add(const Duration(hours: 1))
      .toUtc()
      .toIso8601String(),
  'refreshToken': 'refresh-1',
  'user': {
    'subject': 'me',
    'name': 'Sam Scrum',
    'email': 'sam@example.com',
    'role': role,
  },
});

Map<String, Object?> mine({
  String? status,
  String? note,
  bool open = true,
  int available = 14,
  int maybe = 3,
  int out = 4,
  int noReply = 9,
}) => {
  'fixtureId': 'm1',
  'status': status,
  'note': note,
  'updatedAt': null,
  'counts': {
    'available': available,
    'maybe': maybe,
    'unavailable': out,
    'noReply': noReply,
  },
  'open': open,
};

http.Response json(Object? body, [int status = 200]) =>
    http.Response(jsonEncode(body), status);

Map<String, Object?> slot(int number, String subject, String name) => {
  'number': number,
  'position': number <= 15 ? 'Pos $number' : 'Replacement',
  'subject': subject,
  'name': name,
};

void main() {
  late List<http.Request> requests;
  late Map<String, FutureOr<http.Response> Function(http.Request)> routes;

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    requests = [];
    routes = {
      'GET /v1/availability/mine': (_) => json([]),
      'GET /v1/fixtures/m1/availability': (_) => json(mine()),
      'GET /v1/fixtures/m1/lineup': (_) =>
          json({'fixtureId': 'm1', 'status': 'none', 'slots': []}),
    };
  });

  Iterable<http.Request> sent(String method, String path) =>
      requests.where((r) => r.method == method && r.url.path == path);

  /// App services against a fake API; signed in as [role] unless null.
  Future<AppServices> services({String? role = 'player'}) async {
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path == '/v1/auth/mobile/google') {
        return http.Response(session(role ?? 'player'), 200);
      }
      final route = routes['${request.method} ${request.url.path}'];
      return route == null ? http.Response('', 404) : await route(request);
    });
    final auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    final api = ApiClient(base: base, client: client, tokens: auth);
    final services = AppServices(
      club: ClubDataController(OneMatchRepository()),
      standings: StandingsRepository(),
      teams: TeamDirectory.bundled(),
      auth: auth,
      members: MemberRepository(api),
      admin: AdminRepository(api),
      prefs: SharedPreferencesAsync(),
    );
    if (role != null) await auth.signIn();
    return services;
  }

  Future<AppServices> pump(
    WidgetTester tester,
    Widget page, {
    String? role = 'player',
  }) async {
    final app = await services(role: role);
    tester.view.physicalSize = const Size(375, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    addTearDown(app.auth.dispose);
    await tester.pumpWidget(
      AppScope(
        services: app,
        child: MaterialApp(
          theme: buildClaymoresTheme(),
          home: Scaffold(body: page),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return app;
  }

  Widget details() => MatchDetailsPage(id: 'm1', fixture: match);

  group('CAN YOU PLAY?', () {
    testWidgets('saves optimistically and shows the club counts', (
      tester,
    ) async {
      final reply = Completer<http.Response>();
      routes['PUT /v1/fixtures/m1/availability'] = (_) => reply.future;
      await pump(tester, details());

      expect(find.text('CAN YOU PLAY?'), findsOneWidget);
      expect(
        find.text('14 available · 3 maybe · 4 out · 9 no reply'),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(const Key('availability-note')),
        'first half only',
      );
      await tester.tap(find.text('MAYBE'));
      await tester.pump();

      // Moved from "no reply" to "maybe" before the server answers.
      expect(
        find.text('14 available · 4 maybe · 4 out · 8 no reply'),
        findsOneWidget,
      );
      final put = sent('PUT', '/v1/fixtures/m1/availability').single;
      expect(put.headers['Authorization'], 'Bearer access-1');
      expect(jsonDecode(put.body), {
        'status': 'maybe',
        'note': 'first half only',
      });

      reply.complete(
        json(mine(status: 'maybe', note: 'first half only', maybe: 5)),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('14 available · 5 maybe · 4 out · 9 no reply'),
        findsOneWidget,
      );
      final choices = tester.widget<SegmentedButton<AvailabilityStatus>>(
        find.byKey(const Key('availability-choices')),
      );
      expect(choices.selected, {AvailabilityStatus.maybe});
    });

    testWidgets('rolls back and explains when saving fails', (tester) async {
      routes['GET /v1/fixtures/m1/availability'] = (_) =>
          json(mine(status: 'available', available: 14, noReply: 9));
      routes['PUT /v1/fixtures/m1/availability'] = (_) => json({
        'error': 'Status must be available, maybe or unavailable.',
      }, 400);
      await pump(tester, details());

      await tester.tap(find.text('OUT'));
      await tester.pumpAndSettle();
      expect(
        find.text('Status must be available, maybe or unavailable.'),
        findsOneWidget,
      );
      expect(
        find.text('14 available · 3 maybe · 4 out · 9 no reply'),
        findsOneWidget,
      );
      final choices = tester.widget<SegmentedButton<AvailabilityStatus>>(
        find.byKey(const Key('availability-choices')),
      );
      expect(choices.selected, {AvailabilityStatus.available});
    });

    testWidgets('a 409 closes answers after rolling back', (tester) async {
      routes['PUT /v1/fixtures/m1/availability'] = (_) => json({
        'error': 'This match has been played, so answers are closed.',
      }, 409);
      await pump(tester, details());

      await tester.tap(find.text('AVAILABLE'));
      await tester.pumpAndSettle();
      expect(
        find.text('This match has been played, so answers are closed.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('availability-choices')), findsNothing);
      expect(find.text('You didn’t answer for this match.'), findsOneWidget);
    });

    testWidgets('closed answers are read-only', (tester) async {
      routes['GET /v1/fixtures/m1/availability'] = (_) =>
          json(mine(status: 'unavailable', note: 'away', open: false));
      await pump(tester, details());

      expect(find.byKey(const Key('availability-choices')), findsNothing);
      expect(find.byKey(const Key('availability-note')), findsNothing);
      expect(find.text('OUT'), findsOneWidget);
      expect(find.text('“away”'), findsOneWidget);
      expect(find.text('Answers are closed.'), findsOneWidget);
    });

    testWidgets('signed out: an invitation to sign in, no API calls', (
      tester,
    ) async {
      await pump(tester, details(), role: null);

      expect(find.text('Sign in to say if you can play.'), findsOneWidget);
      expect(find.text('SIGN IN'), findsOneWidget);
      expect(find.text('CAN YOU PLAY?'), findsNothing);
      expect(requests, isEmpty);
    });

    testWidgets('club events and past matches take no answers', (tester) async {
      final played = Fixture({
        ...matchJson,
        'date': '2020-02-07',
        'status': 'played',
        'homeScore': 10,
        'awayScore': 5,
      });
      await pump(tester, MatchDetailsPage(id: 'm1', fixture: played));
      expect(find.text('CAN YOU PLAY?'), findsNothing);
      expect(sent('GET', '/v1/fixtures/m1/availability'), isEmpty);
    });
  });

  group('Club tab upcoming matches', () {
    Widget section({bool plays = true}) => Builder(
      builder: (context) => ListView(
        children: [
          UpcomingMatchesSection(
            members: AppScope.of(context).members!,
            plays: plays,
          ),
        ],
      ),
    );

    testWidgets('players answer right in the row; next unanswered is open', (
      tester,
    ) async {
      routes['PUT /v1/fixtures/m1/availability'] = (_) =>
          json(mine(status: 'available', available: 15));
      await pump(tester, section());

      expect(find.text('UPCOMING MATCHES'), findsOneWidget);
      expect(find.text('vs Daytona'), findsOneWidget);
      expect(find.text('ANSWER'), findsOneWidget);
      // Open already: the buttons, without a second "CAN YOU PLAY?" heading.
      expect(find.text('CAN YOU PLAY?'), findsNothing);
      expect(find.byKey(const Key('availability-choices')), findsOneWidget);

      await tester.tap(find.text('AVAILABLE').first);
      await tester.pumpAndSettle();
      expect(sent('PUT', '/v1/fixtures/m1/availability'), hasLength(1));
      expect(find.text('ANSWER'), findsNothing);

      // Tapping the row folds it.
      await tester.tap(find.text('vs Daytona'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('availability-choices')), findsNothing);
    });

    testWidgets('coaches see how many can play, no buttons', (tester) async {
      await pump(tester, section(plays: false), role: 'coach');
      expect(find.text('14 AVAILABLE'), findsOneWidget);
      expect(find.byKey(const Key('availability-choices')), findsNothing);
      expect(find.textContaining('pick lineups'), findsOneWidget);
    });
  });

  group('cards', () {
    testWidgets('a fixture card shows my answer from /availability/mine', (
      tester,
    ) async {
      routes['GET /v1/availability/mine'] = (_) => json([
        {'fixtureId': 'm1', 'status': 'available', 'note': null},
      ]);
      await pump(tester, FixtureCard(fixture: match, availability: true));

      expect(sent('GET', '/v1/availability/mine'), hasLength(1));
      expect(find.text('YOU: AVAILABLE'), findsOneWidget);
      expect(find.byKey(const Key('availability-prompt')), findsNothing);
    });

    testWidgets('Home asks me to answer an unanswered next match', (
      tester,
    ) async {
      final app = await pump(tester, const HomePage());

      expect(find.text('Can you play? Let the coaches know.'), findsOneWidget);
      expect(find.text('ANSWER'), findsOneWidget);

      // Answering elsewhere (the match page) swaps the prompt for the chip.
      app.availability.put(
        const AvailabilityAnswer(
          fixtureId: 'm1',
          status: AvailabilityStatus.maybe,
        ),
      );
      await tester.pump();
      expect(find.text('YOU: MAYBE'), findsOneWidget);
      expect(find.byKey(const Key('availability-prompt')), findsNothing);

      // Signing out clears the answers.
      await app.auth.signOut();
      await tester.pumpAndSettle();
      expect(find.text('YOU: MAYBE'), findsNothing);
      expect(find.byKey(const Key('availability-prompt')), findsNothing);
    });
  });

  testWidgets('a published lineup lists starters and replacements', (
    tester,
  ) async {
    routes['GET /v1/fixtures/m1/lineup'] = (_) => json({
      'fixtureId': 'm1',
      'status': 'published',
      'publishedAt': '2099-02-05T12:00:00Z',
      'slots': [
        slot(1, 'p1', 'Pat Prop'),
        {
          'number': 9,
          'position': 'Scrum-half',
          'subject': 'me',
          'name': 'Sam Scrum',
        },
        slot(16, 'r1', 'Rory Bench'),
      ],
    });
    await pump(tester, details());

    expect(find.text('LINEUP'), findsOneWidget);
    expect(find.text('Pat Prop'), findsOneWidget);
    expect(find.text('Scrum-half'), findsOneWidget);
    expect(find.text('REPLACEMENTS'), findsOneWidget);
    expect(find.text('Rory Bench'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('lineup-me')),
        matching: find.text('YOU'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('lineup-me')),
        matching: find.text('Sam Scrum'),
      ),
      findsOneWidget,
    );
    // Players don't see the admin area.
    expect(find.text('ADMIN'), findsNothing);
    expect(sent('GET', '/v1/admin/fixtures/m1/availability'), isEmpty);
  });

  testWidgets('a draft lineup stays hidden from players', (tester) async {
    routes['GET /v1/fixtures/m1/lineup'] = (_) =>
        json({'fixtureId': 'm1', 'status': 'none', 'slots': []});
    await pump(tester, details());
    expect(find.text('LINEUP'), findsNothing);
  });

  group('admin', () {
    late Map<String, Object?> adminLineup;
    late List<Object?> saves;

    setUp(() {
      saves = [];
      adminLineup = {
        'fixtureId': 'm1',
        'status': 'draft',
        'slots': [slot(2, 'b', 'Blake Hooker')],
      };
      routes['GET /v1/admin/fixtures/m1/availability'] = (_) => json({
        'fixtureId': 'm1',
        'counts': {'available': 2, 'maybe': 1, 'unavailable': 1, 'noReply': 1},
        'members': [
          {
            'subject': 'a',
            'email': 'a@example.com',
            'name': 'Alex Avail',
            'status': 'available',
            'note': null,
          },
          {
            'subject': 'b',
            'email': 'b@example.com',
            'name': 'Blake Hooker',
            'status': 'available',
            'note': 'can cover prop',
          },
          {
            'subject': 'c',
            'email': 'c@example.com',
            'name': 'Casey Maybe',
            'status': 'maybe',
            'note': 'first half only',
          },
          {
            'subject': 'd',
            'email': 'd@example.com',
            'name': 'Dana Away',
            'status': 'unavailable',
          },
          {
            'subject': 'e',
            'email': 'e@example.com',
            'name': null,
            'status': null,
          },
        ],
      });
      routes['GET /v1/admin/fixtures/m1/lineup'] = (_) => json(adminLineup);
      routes['PUT /v1/admin/fixtures/m1/lineup'] = (request) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        saves.add(body);
        adminLineup = {
          'fixtureId': 'm1',
          'status': body['publish'] == true ? 'published' : 'draft',
          'slots': [
            for (final s in body['slots'] as List)
              slot(s['number'] as int, s['subject'] as String, 'Player'),
          ],
        };
        return json(adminLineup);
      };
    });

    testWidgets('admins see who said what, grouped, with notes', (
      tester,
    ) async {
      await pump(tester, details(), role: 'admin');

      expect(find.text('ADMIN'), findsOneWidget);
      final breakdown = find.byKey(const Key('availability-breakdown'));
      Finder inside(String text) =>
          find.descendant(of: breakdown, matching: find.text(text));
      expect(inside('AVAILABLE · 2'), findsOneWidget);
      expect(inside('MAYBE · 1'), findsOneWidget);
      expect(inside('NO REPLY · 1'), findsOneWidget);
      expect(inside('OUT · 1'), findsOneWidget);
      expect(inside('Casey Maybe'), findsOneWidget);
      expect(inside('“first half only”'), findsOneWidget);
      expect(inside('e@example.com'), findsOneWidget);
      expect(find.text('Draft · 1 of 23 picked'), findsOneWidget);
    });

    testWidgets('admins see the lineup but only the coach picks it', (
      tester,
    ) async {
      await pump(tester, details(), role: 'admin');
      expect(find.text('Draft · 1 of 23 picked'), findsOneWidget);
      expect(find.text('EDIT LINEUP'), findsNothing);
      expect(find.text('The coach picks it'), findsOneWidget);
      expect(find.text('CAN YOU PLAY?'), findsOneWidget);
    });

    testWidgets('coaches pick lineups and aren’t asked to play', (
      tester,
    ) async {
      await pump(tester, details(), role: 'coach');
      expect(find.text('EDIT LINEUP'), findsOneWidget);
      expect(find.text('CAN YOU PLAY?'), findsNothing);
      expect(find.text('AVAILABLE · 2'), findsOneWidget);
    });

    testWidgets('the editor saves a draft and publishes after confirming', (
      tester,
    ) async {
      await pump(tester, details(), role: 'coach');
      await tester.tap(find.text('EDIT LINEUP'));
      await tester.pumpAndSettle();

      expect(find.text('DRAFT'), findsOneWidget);
      expect(find.text('Loosehead prop'), findsOneWidget);
      expect(find.text('Fullback'), findsOneWidget);
      expect(find.text('REPLACEMENTS'), findsOneWidget);

      // Picker: available first, labelled; Blake (in #2) moves to #1.
      await tester.tap(find.byKey(const Key('lineup-slot-1')));
      await tester.pumpAndSettle();
      final eyebrows = tester
          .widgetList<Text>(find.textContaining(' · '))
          .map((t) => t.data)
          .where((t) => t != null && RegExp(r'^[A-Z ]+ · \d$').hasMatch(t))
          .toList();
      expect(eyebrows, [
        'AVAILABLE · 2',
        'MAYBE · 1',
        'NO REPLY · 1',
        'OUT · 1',
      ]);
      expect(find.text('In #2 · moves here · can cover prop'), findsOneWidget);
      await tester.tap(find.byKey(const Key('pick-b')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('lineup-slot-15')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('pick-c')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('SAVE DRAFT'));
      await tester.pumpAndSettle();
      expect(saves.last, {
        'slots': [
          {'number': 1, 'subject': 'b'},
          {'number': 15, 'subject': 'c'},
        ],
        'publish': false,
      });
      expect(find.text('Draft saved.'), findsOneWidget);

      // Clear #15, then publish.
      await tester.tap(find.byTooltip('Clear #15'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'PUBLISH'));
      await tester.pumpAndSettle();
      expect(find.text('Publish lineup?'), findsOneWidget);
      expect(find.text('Players in it get a notification.'), findsOneWidget);
      await tester.tap(find.text('CANCEL'));
      await tester.pumpAndSettle();
      expect(saves, hasLength(1));

      await tester.tap(find.widgetWithText(FilledButton, 'PUBLISH'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('PUBLISH'),
        ),
      );
      await tester.pumpAndSettle();
      expect(saves.last, {
        'slots': [
          {'number': 1, 'subject': 'b'},
        ],
        'publish': true,
      });
      expect(find.text('PUBLISHED'), findsOneWidget);
      expect(find.text('Lineup published.'), findsOneWidget);

      // Back on the match page the admin card shows the new state.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Published · 1 of 23 picked'), findsOneWidget);
    });

    testWidgets('the editor shows the API’s 400 message', (tester) async {
      routes['PUT /v1/admin/fixtures/m1/lineup'] = (_) => json({
        'error':
            'Everyone in a lineup must be a club member who has signed in.',
      }, 400);
      await pump(tester, details(), role: 'coach');
      await tester.tap(find.text('EDIT LINEUP'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('SAVE DRAFT'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Everyone in a lineup must be a club member who has signed in.',
        ),
        findsOneWidget,
      );
      expect(find.text('DRAFT'), findsOneWidget);
    });
  });
}
