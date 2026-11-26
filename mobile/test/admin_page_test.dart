import 'dart:convert';

import 'package:claymores/app/router.dart';
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
import 'package:claymores/features/admin/admin_page.dart';
import 'package:claymores/features/admin/admin_people.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/club/my_dues.dart';
import 'package:claymores/shared/team_logo.dart';
import 'package:claymores/shared/widgets.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

final base = ApiBase.tryParse('https://api.example.com')!;

class EmptyClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async =>
      ClubData('{"result":{"matches":[],"practice":null}}', isSnapshot: false);
}

/// A schedule with [fixtures] (`/v1/fixtures` items).
class FixturesClubRepository extends ClubRepository {
  const FixturesClubRepository(this.fixtures);
  final List<Map<String, Object?>> fixtures;

  @override
  Future<ClubData> load() async => ClubData.parts(
    fixtures: parseFixtures(fixtures),
    practice: Practice(null),
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
    'subject': 'google-admin',
    'name': 'Casey Coach',
    'email': 'casey@example.com',
    'role': role,
  },
});

Map<String, Object?> assessment(
  String id,
  String subject, {
  int paid = 0,
  int credited = 0,
  int pending = 0,
  String description = '2026-27 Season dues',
}) => {
  'id': id,
  'playerSubject': subject,
  'description': description,
  'amountCents': 12500,
  'dueDate': null,
  'paidCents': paid,
  'creditedCents': credited,
  'balanceCents': 12500 - paid,
  'pendingCheckoutCents': pending,
};

/// `GET /v1/admin/dues/{id}`: the assessment and its payments.
String detail(
  Map<String, Object?> assessment, [
  List<Map<String, Object?>> payments = const [],
]) => jsonEncode({'assessment': assessment, 'payments': payments});

void main() {
  late List<http.Request> requests;
  late http.Response Function(http.Request) respond;
  late String role;

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    requests = [];
    role = 'admin';
    respond = (_) => http.Response('[]', 200);
  });

  /// Signs in as [role] and shows [page] with the app's services.
  Future<AppServices> pump(WidgetTester tester, Widget page) async {
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path == '/v1/auth/mobile/google') {
        return http.Response(session(role), 200);
      }
      if (request.url.path == '/v1/me/identities') {
        return http.Response('{"providers":["google"]}', 200);
      }
      return respond(request);
    });
    final auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    final api = ApiClient(base: base, client: client, tokens: auth);
    final prefs = SharedPreferencesAsync();
    final services = AppServices(
      club: ClubDataController(EmptyClubRepository()),
      standings: StandingsRepository(),
      teams: TeamDirectory.bundled(),
      auth: auth,
      members: MemberRepository(api),
      admin: AdminRepository(api),
      prefs: prefs,
    );
    await auth.signIn();
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      AppScope(
        services: services,
        child: MaterialApp(theme: buildClaymoresTheme(), home: page),
      ),
    );
    await tester.pumpAndSettle();
    return services;
  }

  Future<void> finish(WidgetTester tester, AppServices services) async {
    await tester.pumpWidget(const SizedBox());
    services.auth.dispose(); // cancels the refresh timer
  }

  /// Signs in as [role] and opens the app's router at [location].
  Future<AppServices> pumpApp(
    WidgetTester tester, {
    String location = '/club',
    bool duesEnabled = true,
    ClubRepository? club,
  }) async {
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path == '/v1/auth/mobile/google') {
        return http.Response(session(role), 200);
      }
      if (request.url.path == '/v1/me/identities') {
        return http.Response('{"providers":["google"]}', 200);
      }
      return respond(request);
    });
    final auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    final api = ApiClient(base: base, client: client, tokens: auth);
    final prefs = SharedPreferencesAsync();
    final services = AppServices(
      club: ClubDataController(club ?? EmptyClubRepository()),
      standings: StandingsRepository(),
      teams: TeamDirectory.bundled(),
      auth: auth,
      members: MemberRepository(api),
      admin: AdminRepository(api),
      prefs: prefs,
      duesEnabled: duesEnabled,
    );
    await auth.signIn();
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = buildRouter();
    addTearDown(router.dispose);
    await tester.pumpWidget(
      AppScope(
        services: services,
        child: MaterialApp.router(
          theme: buildClaymoresTheme(),
          routerConfig: router,
        ),
      ),
    );
    router.go(location);
    await tester.pumpAndSettle();
    return services;
  }

  Map<String, Object?> mine(
    String id, {
    int amount = 15000,
    int paid = 0,
    String? dueDate,
    String description = '2026-27 Season dues',
  }) => {
    'id': id,
    'playerSubject': 'google-admin',
    'description': description,
    'amountCents': amount,
    'dueDate': dueDate,
    'paidCents': paid,
    'creditedCents': 0,
    'balanceCents': amount - paid,
    'pendingCheckoutCents': 0,
  };

  group('Club tab, signed in', () {
    testWidgets('shows the balance and dues, and no sign-in buttons', (
      tester,
    ) async {
      role = 'player';
      respond = (request) => switch (request.url.path) {
        '/v1/dues/mine' => http.Response(
          jsonEncode([
            mine('d1', paid: 5000, dueDate: '2027-03-01'),
            mine('d2', amount: 5000, paid: 5000, description: 'Kit fee'),
          ]),
          200,
        ),
        '/v1/dues/mine/d1' => http.Response(
          detail(mine('d1', paid: 5000, dueDate: '2027-03-01')),
          200,
        ),
        _ => http.Response('[]', 200),
      };
      final services = await pumpApp(tester);
      expect(find.text('CASEY COACH'), findsOneWidget);
      expect(find.text('YOUR DUES'), findsOneWidget);
      expect(find.text('\$100.00 DUE'), findsOneWidget);
      expect(find.text('\$100.00 due · due Mar 1'), findsOneWidget);
      expect(find.text('Paid \$50.00 of \$150.00'), findsOneWidget);
      expect(find.text('Paid in full'), findsOneWidget);
      expect(find.textContaining('Assessed'), findsNothing);
      expect(find.text('SIGN OUT'), findsNothing);
      expect(find.text('MY PROFILE'), findsNothing);
      expect(find.text('Sign in'.toUpperCase()), findsNothing);
      expect(find.byKey(const Key('sign-in-with-apple')), findsNothing);
      expect(find.text('Sign in with Google'), findsNothing);
      expect(find.byKey(const Key('club-admin-entry')), findsNothing);
      expect(
        requests.where((r) => r.url.path.startsWith('/v1/admin')),
        isEmpty,
      );

      // A tile opens the dues detail, where Pay lives.
      await tester.tap(find.text('\$100.00 due · due Mar 1'));
      await tester.pumpAndSettle();
      expect(find.text('DUES'), findsOneWidget);
      expect(find.text('PAY'), findsOneWidget);
      await finish(tester, services);
    });

    testWidgets('all paid up', (tester) async {
      role = 'player';
      respond = (request) => request.url.path == '/v1/dues/mine'
          ? http.Response(jsonEncode([mine('d1', paid: 15000)]), 200)
          : http.Response('[]', 200);
      final services = await pumpApp(tester);
      expect(find.text('ALL PAID UP'), findsOneWidget);
      await finish(tester, services);
    });

    testWidgets('the gear opens Account, with sign-in methods and sign out', (
      tester,
    ) async {
      final services = await pumpApp(tester, duesEnabled: false);
      expect(find.text('YOUR DUES'), findsNothing);
      expect(find.byTooltip('Account settings'), findsOneWidget);
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      expect(find.text('ACCOUNT'), findsOneWidget);
      expect(find.text('casey@example.com'), findsOneWidget);
      expect(find.text('SIGN-IN'), findsOneWidget);
      expect(find.text('Opens with: Google'), findsOneWidget);
      expect(find.text('SIGN OUT'), findsOneWidget);
      expect(find.byKey(const Key('delete-account')), findsOneWidget);
      // No dues or admin entry on the account page.
      expect(find.text('YOUR DUES'), findsNothing);
      expect(find.byKey(const Key('club-admin-entry')), findsNothing);

      await tester.tap(find.byKey(const Key('sign-out')));
      await tester.pumpAndSettle();
      expect(services.auth.signedIn, isFalse);
      expect(find.text('ACCOUNT'), findsOneWidget); // the Club tab heading
      expect(find.byTooltip('Account settings'), findsNothing);
      await finish(tester, services);
    });

    testWidgets('the Club Admin card shows live counts, for admins only', (
      tester,
    ) async {
      respond = (request) => switch (request.url.path) {
        '/v1/admin/dues' => http.Response(
          jsonEncode([
            assessment('d1', 'alex', paid: 12500),
            assessment('d2', 'blake', paid: 5000),
            assessment('d3', 'gone'),
          ]),
          200,
        ),
        '/v1/admin/join-requests' => http.Response(
          jsonEncode([
            {'id': 'r1', 'email': 'a@example.com', 'status': 'pending'},
            {'id': 'r2', 'email': 'b@example.com', 'status': 'pending'},
          ]),
          200,
        ),
        _ => http.Response('[]', 200),
      };
      var services = await pumpApp(tester, duesEnabled: false);
      expect(find.byKey(const Key('club-admin-entry')), findsOneWidget);
      expect(find.text('CLUB ADMIN'), findsOneWidget);
      expect(find.text('Dues: 1 of 3 paid'), findsOneWidget);
      expect(find.text('Join requests: 2'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          'Club admin. Dues: 1 of 3 paid. Join requests: 2',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('club-admin-entry')));
      await tester.pumpAndSettle();
      // The same numbers on the admin screen's tiles.
      expect(find.text('2 waiting'), findsOneWidget);
      expect(find.text('\$200.00'), findsOneWidget);
      await tester.tap(find.text('DUES'));
      await tester.pumpAndSettle();
      expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);
      await finish(tester, services);

      role = 'player';
      requests.clear();
      services = await pumpApp(tester, duesEnabled: false);
      expect(find.text('CASEY COACH'), findsOneWidget);
      expect(find.byKey(const Key('club-admin-entry')), findsNothing);
      expect(find.text('CLUB ADMIN'), findsNothing);
      expect(
        requests.where((r) => r.url.path.startsWith('/v1/admin')),
        isEmpty,
      );
      await finish(tester, services);
    });
  });

  testWidgets('a player who opens the admin route sees no admin data', (
    tester,
  ) async {
    role = 'player';
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );
    expect(find.text('Only club admins can open this page.'), findsOneWidget);
    expect(requests.where((r) => r.url.path.startsWith('/v1/admin')), isEmpty);
    await finish(tester, services);
  });

  testWidgets('assign dues to everyone, automatic dues, remove unpaid dues', (
    tester,
  ) async {
    var all = [assessment('d1', 'alex'), assessment('d2', 'blake', paid: 5000)];
    respond = (request) => switch ((request.method, request.url.path)) {
      ('GET', '/v1/admin/dues') => http.Response(jsonEncode(all), 200),
      ('GET', '/v1/admin/members') => http.Response(
        jsonEncode([
          {
            'subject': 'alex',
            'email': 'alex@example.com',
            'name': 'Alex Rossi',
          },
          {
            'subject': 'blake',
            'email': 'blake@example.com',
            'name': 'Blake Smith',
          },
          {
            'subject': 'cj',
            'email': 'cj@example.com',
            'name': 'Coach J',
            'role': 'coach',
          },
        ]),
        200,
      ),
      ('POST', '/v1/admin/dues/all-members') => http.Response(
        jsonEncode({'created': 1, 'skipped': 1, 'members': 2}),
        200,
      ),
      ('GET', '/v1/admin/dues/automatic') => http.Response(
        jsonEncode({
          'enabled': false,
          'description': 'Season dues',
          'amountCents': 0,
          'dueDate': null,
        }),
        200,
      ),
      ('PUT', '/v1/admin/dues/automatic') => http.Response('{}', 200),
      ('GET', '/v1/admin/dues/d1') => http.Response(
        detail(assessment('d1', 'alex')),
        200,
      ),
      ('DELETE', '/v1/admin/dues/d1') => () {
        all = [assessment('d2', 'blake', paid: 5000)];
        return http.Response('', 204);
      }(),
      _ => http.Response('[]', 200),
    };
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );

    // Assign to everyone: coaches aren't counted.
    await tester.tap(find.byKey(const Key('assign-dues')));
    await tester.pumpAndSettle();
    expect(find.text('ASSIGN DUES'), findsWidgets);
    await tester.tap(find.text('EVERYONE (2)'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-assign-dues')));
    await tester.pumpAndSettle();
    expect(find.text('Enter an amount, like 125.00.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('assign-amount')), '125');
    await tester.tap(find.byKey(const Key('save-assign-dues')));
    await tester.pumpAndSettle();
    final post = requests.lastWhere((r) => r.method == 'POST');
    expect(post.url.path, '/v1/admin/dues/all-members');
    final body = jsonDecode(post.body) as Map<String, dynamic>;
    expect(body['amountCents'], 12500);
    expect(body['description'], 'Season dues');
    expect(body['skipExisting'], true);
    expect(body['batchId'], isNotEmpty);
    expect(
      find.text('Assigned \$125.00 to 1 player (1 already had it).'),
      findsOneWidget,
    );

    // Automatic dues: turn on with an amount.
    await tester.tap(find.byKey(const Key('automatic-dues')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('automatic-enabled')));
    await tester.enterText(find.byKey(const Key('automatic-amount')), '125');
    await tester.tap(find.byKey(const Key('save-automatic-dues')));
    await tester.pumpAndSettle();
    final put = requests.lastWhere((r) => r.method == 'PUT');
    expect(jsonDecode(put.body), {
      'enabled': true,
      'description': 'Season dues',
      'amountCents': 12500,
      'dueDate': null,
    });
    expect(
      find.text('Automatic dues on: \$125.00 for new players.'),
      findsOneWidget,
    );

    // Remove Alex's unpaid dues from the player page.
    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex Rossi'));
    await tester.pumpAndSettle();
    expect(find.text('PLAYER DUES'), findsOneWidget);
    await tester.tap(find.byKey(const Key('remove-dues')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-remove-dues')));
    await tester.pumpAndSettle();
    expect(requests.last.method, isNot('DELETE'));
    expect(
      requests.where((r) => r.method == 'DELETE').single.url.path,
      '/v1/admin/dues/d1',
    );
    expect(find.text('PLAYER DUES'), findsNothing);
    expect(
      find.text('Removed 2026-27 Season dues for Alex Rossi.'),
      findsOneWidget,
    );
    await finish(tester, services);
  });

  testWidgets('dues summary, record payment with 409 then success', (
    tester,
  ) async {
    var paid = false;
    respond = (request) => switch (request.url.path) {
      '/v1/admin/dues' => http.Response(
        jsonEncode([
          assessment('d1', 'alex', paid: 12500),
          assessment('d2', 'blake', paid: paid ? 12500 : 5000),
          assessment('d3', 'gone'),
        ]),
        200,
      ),
      '/v1/admin/members' => http.Response(
        jsonEncode([
          {'subject': 'alex', 'email': 'alex@example.com', 'name': 'Alex'},
          {'subject': 'blake', 'email': 'blake@example.com', 'name': null},
        ]),
        200,
      ),
      '/v1/admin/dues/d2' => http.Response(
        detail(assessment('d2', 'blake', paid: paid ? 12500 : 5000)),
        200,
      ),
      '/v1/admin/dues/d2/payments' => http.Response(
        jsonEncode({'error': 'That is more than the \$75.00 balance.'}),
        409,
      ),
      _ => http.Response('[]', 200),
    };
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );

    expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);
    expect(
      find.text('1 of 3 paid in full · 1 partly paid · 1 unpaid'),
      findsOneWidget,
    );
    expect(find.text('\$175 collected · \$200 outstanding'), findsOneWidget);

    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('blake@example.com'), findsOneWidget);
    expect(find.text('Former member'), findsOneWidget);

    await tester.ensureVisible(find.text('blake@example.com'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('blake@example.com'));
    await tester.pumpAndSettle();
    expect(find.text('PLAYER DUES'), findsOneWidget);
    expect(find.text('\$75.00 due'), findsOneWidget);
    await tester.tap(find.byKey(const Key('record-payment')));
    await tester.pumpAndSettle();
    expect(find.text('RECORD PAYMENT'), findsOneWidget);
    final amount = tester.widget<TextField>(
      find.byKey(const Key('payment-amount')),
    );
    expect(amount.controller!.text, '75.00');

    await tester.tap(find.byKey(const Key('save-payment')));
    await tester.pumpAndSettle();
    expect(find.text('That is more than the \$75.00 balance.'), findsOneWidget);
    final first = jsonDecode(requests.last.body) as Map<String, dynamic>;
    expect(first['amountCents'], 7500);
    expect(first['method'], 'cash');

    // Succeeds the second time: a definite 409 means a new id.
    paid = true;
    final previous = respond;
    respond = (request) => request.url.path == '/v1/admin/dues/d2/payments'
        ? http.Response('{}', 200)
        : previous(request);
    await tester.tap(find.text('Venmo'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('save-payment')));
    await tester.pumpAndSettle();
    final posts = requests
        .where((r) => r.url.path == '/v1/admin/dues/d2/payments')
        .map((r) => jsonDecode(r.body) as Map<String, dynamic>)
        .toList();
    expect(posts, hasLength(2));
    expect(posts.last['method'], 'venmo');
    expect(posts.last['id'], isNot(posts.first['id']));
    expect(find.text('RECORD PAYMENT'), findsNothing);
    expect(
      find.text('Recorded \$75.00 for blake@example.com.'),
      findsOneWidget,
    );
    expect(find.text('Paid in full'), findsOneWidget);
    expect(find.byKey(const Key('record-payment')), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('2 of 3 paid in full · 1 unpaid'), findsOneWidget);
    await finish(tester, services);
  });

  testWidgets('a network error retries with the same payment id', (
    tester,
  ) async {
    var fail = true;
    respond = (request) => switch (request.url.path) {
      '/v1/admin/dues' => http.Response(
        jsonEncode([assessment('d1', 'alex')]),
        200,
      ),
      '/v1/admin/dues/d1' => http.Response(
        detail(assessment('d1', 'alex')),
        200,
      ),
      '/v1/admin/dues/d1/payments' =>
        fail ? throw http.ClientException('offline') : http.Response('{}', 200),
      _ => http.Response('[]', 200),
    };
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );
    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Former member'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('record-payment')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-payment')));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Couldn’t reach the club server'),
      findsOneWidget,
    );

    fail = false;
    await tester.tap(find.byKey(const Key('save-payment')));
    await tester.pumpAndSettle();
    final ids = requests
        .where((r) => r.url.path == '/v1/admin/dues/d1/payments')
        .map((r) => (jsonDecode(r.body) as Map)['id'])
        .toList();
    expect(ids, hasLength(2));
    expect(ids.first, ids.last);
    await finish(tester, services);
  });

  testWidgets('a volunteer credit needs a note before it is sent', (
    tester,
  ) async {
    respond = (request) => switch (request.url.path) {
      '/v1/admin/dues' => http.Response(
        jsonEncode([
          assessment('d1', 'alex', paid: 12500, credited: 2500),
          assessment('d2', 'blake'),
        ]),
        200,
      ),
      '/v1/admin/dues/d2' => http.Response(
        detail(assessment('d2', 'blake')),
        200,
      ),
      '/v1/admin/dues/d2/payments' => http.Response('{}', 200),
      _ => http.Response('[]', 200),
    };
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );
    expect(
      find.text('\$100 collected · \$25 credited · \$125 outstanding'),
      findsOneWidget,
    );

    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Former member').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('record-payment')));
    await tester.pumpAndSettle();
    expect(find.text('Not money: Volunteered · Waived'), findsOneWidget);
    expect(find.text('Note (optional)'), findsOneWidget);

    await tester.tap(find.text('Volunteered'));
    await tester.pump();
    expect(find.text('What did they do? e.g. Reffed U12 game'), findsOneWidget);
    await tester.tap(find.text('Waived'));
    await tester.pump();
    expect(find.text('Why? e.g. Scholarship, injury'), findsOneWidget);
    await tester.tap(find.text('Volunteered'));
    await tester.pump();

    final save = find.byKey(const Key('save-payment'));
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.text('Add a note saying what they did.'), findsOneWidget);
    expect(requests.where((r) => r.url.path.endsWith('/payments')), isEmpty);

    await tester.enterText(
      find.byKey(const Key('payment-note')),
      '  Reffed U12 game ',
    );
    await tester.pump();
    expect(find.text('Add a note saying what they did.'), findsNothing);
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    final post = requests.singleWhere((r) => r.url.path.endsWith('/payments'));
    final body = jsonDecode(post.body) as Map<String, dynamic>;
    expect(body['method'], 'volunteer');
    expect(body['note'], 'Reffed U12 game');
    expect(body['amountCents'], 12500);
    expect(find.text('RECORD PAYMENT'), findsNothing);
    await finish(tester, services);
  });

  testWidgets('members see what part of their dues was credited', (
    tester,
  ) async {
    Widget tile(int credited) => MaterialApp(
      theme: buildClaymoresTheme(),
      home: Scaffold(
        body: DuesTile(
          dues: DuesAssessment.fromJson(
            assessment('d1', 'me', paid: 7500, credited: credited),
          ),
        ),
      ),
    );
    await tester.pumpWidget(tile(2500));
    expect(
      find.text('Includes \$25.00 credited (volunteer/waived)'),
      findsOneWidget,
    );
    await tester.pumpWidget(tile(0));
    expect(find.textContaining('credited'), findsNothing);
  });

  testWidgets('dues switched off, and a join request approved', (tester) async {
    var decided = false;
    respond = (request) => switch (request.url.path) {
      '/v1/admin/dues' || '/v1/admin/members' => http.Response('', 404),
      '/v1/admin/join-requests' => http.Response(
        decided
            ? '[]'
            : jsonEncode([
                {
                  'id': 'r1',
                  'provider': 'google',
                  'email': 'sam@example.com',
                  'name': 'Sam Flanker',
                  'phone': null,
                  'message': 'Played in college.',
                  'status': 'pending',
                  'createdAt': '2026-11-20T15:00:00Z',
                  'updatedAt': '2026-11-20T15:00:00Z',
                },
              ]),
        200,
      ),
      '/v1/admin/join-requests/r1/approve' => () {
        decided = true;
        return http.Response('{}', 200);
      }(),
      _ => http.Response('[]', 200),
    };
    final services = await pump(
      tester,
      const AdminPage(initialTab: AdminTab.dues),
    );
    expect(find.text('Dues are switched off'), findsOneWidget);
    await tester.tap(find.text('PEOPLE'));
    await tester.pumpAndSettle();
    expect(find.text('Sam Flanker'), findsOneWidget);
    expect(find.text('Played in college.'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Approve Sam Flanker as a player'),
      findsOneWidget,
    );

    await tester.tap(find.text('APPROVE'));
    await tester.pumpAndSettle();
    final approve = requests.lastWhere((r) => r.url.path.endsWith('/approve'));
    expect(jsonDecode(approve.body), {'role': 'player'});
    expect(
      find.text('Approved Sam Flanker. They can sign in now.'),
      findsOneWidget,
    );
    expect(find.text('No requests waiting.'), findsOneWidget);
    await finish(tester, services);
  });

  group('club admin overview and tabs', () {
    String day(int days) {
      final d = DateTime.now().add(Duration(days: days));
      return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
          '${d.day.toString().padLeft(2, '0')}';
    }

    Map<String, Object?> match(
      String id,
      int days,
      String home,
      String away, {
      String status = 'upcoming',
      String? competition,
    }) => {
      'id': id,
      'date': day(days),
      'homeTeam': home,
      'awayTeam': away,
      'status': status,
      'kickoffTime': '2pm',
      'competition': ?competition,
    };

    const us = 'Central Florida Claymores';
    final schedule = FixturesClubRepository([
      match('m1', 10, us, 'Tampa Bay Krewe'),
      match('m2', 3, 'Jacksonville RFC', us),
      match('m3', 20, us, 'Orlando Griffins'),
      // The Highland Games: a club event, but the club plays there.
      match('event', 5, us, us, competition: 'Annual Highland games'),
      match('past', -3, us, 'Old Opponent'),
      match('played', 1, us, 'Played Opponent', status: 'played'),
    ]);

    Map<String, Object?> availability(String id, Map<String, int> counts) => {
      'fixtureId': id,
      'counts': counts,
      'members': <Object>[],
    };

    late List<Map<String, Object?>> pending;
    late List<Map<String, Object?>> people;
    late http.Response Function(http.Request) onName;

    setUp(() {
      pending = [
        {
          'id': 'r1',
          'email': 'sam@example.com',
          'name': 'Sam Flanker',
          'status': 'pending',
        },
        {
          'id': 'r2',
          'email': 'jo@example.com',
          'name': 'Jo Hooker',
          'status': 'pending',
        },
      ];
      people = [
        {'subject': 'alex', 'email': 'alex@example.com', 'name': 'Alex Rossi'},
        {'subject': 'blake', 'email': 'blake@example.com', 'name': 'Blake'},
        {'subject': 'chris', 'email': 'chris@example.com', 'name': null},
        {'subject': 'dana', 'email': 'dana@example.com', 'name': 'Dana Lee'},
      ];
      onName = (_) => http.Response('{}', 200);
      respond = (request) {
        final path = request.url.path;
        return switch (path) {
          '/v1/admin/dues' => http.Response(
            jsonEncode([
              assessment('d1', 'alex', paid: 12500),
              assessment('d2', 'blake', paid: 5000),
              assessment('d3', 'chris'),
            ]),
            200,
          ),
          '/v1/admin/dues/d2' => http.Response(
            detail(assessment('d2', 'blake', paid: 5000)),
            200,
          ),
          '/v1/admin/members' => http.Response(jsonEncode(people), 200),
          '/v1/admin/join-requests' => http.Response(jsonEncode(pending), 200),
          '/v1/admin/fixtures/m2/availability' => http.Response(
            jsonEncode(
              availability('m2', {
                'available': 14,
                'maybe': 3,
                'unavailable': 0,
                'noReply': 9,
              }),
            ),
            200,
          ),
          '/v1/admin/fixtures/m1/availability' => http.Response(
            jsonEncode(availability('m1', {'available': 2, 'unavailable': 1})),
            200,
          ),
          '/v1/admin/fixtures/event/availability' => http.Response(
            jsonEncode(availability('event', {'available': 4})),
            200,
          ),
          '/v1/admin/fixtures/event/lineup' => http.Response(
            jsonEncode({'fixtureId': 'event', 'status': 'none'}),
            200,
          ),
          '/v1/admin/fixtures/m3/availability' => http.Response(
            jsonEncode(availability('m3', {})),
            200,
          ),
          '/v1/admin/fixtures/m2/lineup' => http.Response(
            jsonEncode({'fixtureId': 'm2', 'status': 'draft', 'slots': []}),
            200,
          ),
          '/v1/admin/fixtures/m1/lineup' => http.Response(
            jsonEncode({'fixtureId': 'm1', 'status': 'published'}),
            200,
          ),
          '/v1/admin/fixtures/m3/lineup' => http.Response(
            jsonEncode({'fixtureId': 'm3', 'status': 'none'}),
            200,
          ),
          _ when path.startsWith('/v1/admin/members/') => onName(request),
          _ when path.startsWith('/v1/admin/join-requests/') => () {
            final id = path.split('/')[4];
            pending.removeWhere((r) => r['id'] == id);
            return http.Response('{}', 200);
          }(),
          _ when path.startsWith('/v1/fixtures/') => http.Response('', 404),
          _ => http.Response('[]', 200),
        };
      };
    });

    Future<AppServices> openAdmin(WidgetTester tester, {String? tab}) =>
        pumpApp(
          tester,
          location: tab == null ? adminPath : '$adminPath?tab=$tab',
          duesEnabled: false,
          club: schedule,
        );

    Future<void> toTop(WidgetTester tester) async {
      await tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 4000),
        6000,
      );
      await tester.pumpAndSettle();
    }

    /// Scrolls [finder] into view (from the top if needed) and returns it.
    Future<Finder> shown(WidgetTester tester, Finder finder) async {
      if (finder.evaluate().isEmpty) await toTop(tester);
      if (finder.evaluate().isEmpty) {
        await tester.scrollUntilVisible(
          finder,
          200,
          scrollable: find.byType(Scrollable).first,
        );
      }
      return finder;
    }

    Future<void> tap(WidgetTester tester, Finder finder) async {
      // The People tab is long; lazily built rows need a scroll first.
      if (finder.evaluate().isEmpty) await toTop(tester);
      if (finder.evaluate().isEmpty) {
        await tester.scrollUntilVisible(
          finder,
          200,
          scrollable: find.byType(Scrollable).first,
        );
      }
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    String field(WidgetTester tester, String key) => tester
        .widget<TextField>(find.byKey(Key('member-$key-name')))
        .controller!
        .text;

    Future<String> tileText(WidgetTester tester, String key) async {
      final tile = find.byKey(Key('tile-$key'));
      if (tile.evaluate().isEmpty) await toTop(tester);
      return tester.widget<AdminTile>(tile).value;
    }

    testWidgets('tiles show the numbers and switch tabs', (tester) async {
      final services = await openAdmin(tester);
      final next = DateTime.parse(day(3));
      final date = const DefaultMaterialLocalizations()
          .formatMediumDate(next)
          .replaceFirst(', ', ' ');
      final nextTile = tester.widget<AdminTile>(
        find.byKey(const Key('tile-next-match')),
      );
      expect(nextTile.label, 'Next match · $date');
      expect(nextTile.value, 'at Jacksonville RFC');
      expect(nextTile.detail, startsWith('14 can play'));
      expect(await tileText(tester, 'join-requests'), '2 waiting');
      expect(
        tester
            .widget<AdminTile>(find.byKey(const Key('tile-join-requests')))
            .alert,
        isTrue,
      );
      expect(await tileText(tester, 'dues-outstanding'), '\$200.00');
      expect(await tileText(tester, 'missing-last-name'), '2');
      expect(
        find.descendant(
          of: find.byKey(const Key('people-badge')),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      // Matches is the default tab (the row, plus the Next match tile).
      expect(find.text('at Jacksonville RFC'), findsNWidgets(2));

      await tap(tester, find.byKey(const Key('tile-join-requests')));
      expect(
        find.widgetWithText(SectionHeading, 'JOIN REQUESTS'),
        findsOneWidget,
      );
      expect(find.text('Sam Flanker'), findsOneWidget);
      expect(find.text('at Jacksonville RFC'), findsOneWidget); // only the tile

      await tap(tester, find.byKey(const Key('tile-dues-outstanding')));
      expect(
        find.widgetWithText(SectionHeading, 'JOIN REQUESTS'),
        findsNothing,
      );
      expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);

      // The Dues tab still opens a player's dues, and comes back to Dues.
      await tap(tester, find.text('2026-27 Season dues · \$125 each'));
      await tap(tester, find.text('Blake'));
      expect(find.text('PLAYER DUES'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);

      await tap(tester, find.byKey(const Key('tile-missing-last-name')));
      expect(find.text('MEMBERS'), findsOneWidget);

      await tap(tester, find.byKey(const Key('tile-next-match')));
      expect(find.text('at Jacksonville RFC'), findsNWidgets(2));
      await finish(tester, services);
    });

    testWidgets('?tab= opens a tab; no waiting requests is not pink', (
      tester,
    ) async {
      pending = [];
      final services = await openAdmin(tester, tab: 'dues');
      expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);
      expect(await tileText(tester, 'join-requests'), 'None waiting');
      expect(
        tester
            .widget<AdminTile>(find.byKey(const Key('tile-join-requests')))
            .alert,
        isFalse,
      );
      expect(find.byKey(const Key('people-badge')), findsNothing);
      await finish(tester, services);
    });

    testWidgets('coaches get Edit lineup on each match; admins don’t', (
      tester,
    ) async {
      var services = await openAdmin(tester, tab: 'matches');
      expect(find.byKey(const Key('edit-lineup-m2')), findsNothing);
      expect(find.textContaining('The coach picks the lineup'), findsOneWidget);
      await finish(tester, services);

      role = 'coach';
      services = await openAdmin(tester, tab: 'matches');
      await tap(tester, find.byKey(const Key('edit-lineup-m2')));
      // Straight to the editor, no match page in between.
      expect(find.widgetWithText(AppBar, 'EDIT LINEUP'), findsOneWidget);
      expect(find.text('GAME INFO'), findsNothing);
      await finish(tester, services);
    });

    testWidgets('match rows show counts and the lineup chip, and open', (
      tester,
    ) async {
      final services = await openAdmin(tester);
      Finder row(String id) => find.byKey(ValueKey('admin-match-$id'));
      Finder inRow(String id, String text) =>
          find.descendant(of: row(id), matching: find.text(text));

      expect(inRow('m2', 'at Jacksonville RFC'), findsOneWidget);
      expect(
        inRow('m2', '14 available · 3 maybe · 9 no reply'),
        findsOneWidget,
      );
      expect(inRow('m2', 'DRAFT'), findsOneWidget);
      expect(inRow('m1', 'vs Tampa Bay Krewe'), findsOneWidget);
      expect(inRow('m1', '2 available · 1 out'), findsOneWidget);
      expect(inRow('m1', 'PUBLISHED'), findsOneWidget);
      expect(inRow('m3', 'No answers yet'), findsOneWidget);
      expect(inRow('m3', 'NO LINEUP'), findsOneWidget);
      expect(
        find.descendant(of: row('m2'), matching: find.byType(TeamLogo)),
        findsOneWidget,
      );
      // Soonest first, club events included by name; past and played
      // matches left out.
      expect(inRow('event', 'Annual Highland Games'), findsOneWidget);
      expect(inRow('event', '4 available'), findsOneWidget);
      expect(
        tester.getTopLeft(row('m2')).dy,
        lessThan(tester.getTopLeft(row('event')).dy),
      );
      expect(
        tester.getTopLeft(row('event')).dy,
        lessThan(tester.getTopLeft(row('m1')).dy),
      );
      expect(
        tester.getTopLeft(row('m1')).dy,
        lessThan(tester.getTopLeft(row('m3')).dy),
      );
      expect(row('past'), findsNothing);
      expect(row('played'), findsNothing);

      int lineupLoads() => requests
          .where((r) => r.url.path == '/v1/admin/fixtures/m2/lineup')
          .length;
      final before = lineupLoads();
      await tap(tester, row('m2'));
      expect(find.text('GAME INFO'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      // Back on Matches (row and tile), reloaded in case the lineup changed.
      expect(find.text('at Jacksonville RFC'), findsNWidgets(2));
      expect(lineupLoads(), greaterThan(before + 1));
      await finish(tester, services);
    });

    testWidgets('admins approve players; only the super admin picks a role', (
      tester,
    ) async {
      final services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.byKey(const Key('more-options-r2')));
      expect(find.byKey(const Key('role-admin-r2')), findsNothing);
      expect(find.byKey(const Key('role-coach-r2')), findsNothing);
      expect(find.byKey(const Key('deny-reason-r2')), findsOneWidget);
      await finish(tester, services);
    });

    testWidgets('approve as player, and as admin under More options', (
      tester,
    ) async {
      role = 'superadmin';
      final services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.byKey(const Key('approve-r1')));
      final first = requests.lastWhere((r) => r.url.path.endsWith('/approve'));
      expect(first.url.path, '/v1/admin/join-requests/r1/approve');
      expect(jsonDecode(first.body), {'role': 'player'});
      expect(
        find.text('Approved Sam Flanker. They can sign in now.'),
        findsOneWidget,
      );
      expect(await tileText(tester, 'join-requests'), '1 waiting');

      await tap(tester, find.byKey(const Key('more-options-r2')));
      await tap(tester, find.byKey(const Key('role-admin-r2')));
      expect(find.text('APPROVE AS ADMIN'), findsOneWidget);
      await tap(tester, find.byKey(const Key('approve-as-r2')));
      expect(find.text('Make Jo Hooker an admin?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirm-admin')));
      await tester.pumpAndSettle();
      final second = requests.lastWhere((r) => r.url.path.endsWith('/approve'));
      expect(second.url.path, '/v1/admin/join-requests/r2/approve');
      expect(jsonDecode(second.body), {'role': 'admin'});
      expect(
        find.text('Approved Jo Hooker as an admin. They can sign in now.'),
        findsOneWidget,
      );
      expect(
        await shown(tester, find.text('No requests waiting.')),
        findsOneWidget,
      );
      await finish(tester, services);
    });

    testWidgets('deny, and deny with a reason', (tester) async {
      final services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.byKey(const Key('more-options-r1')));
      await tester.enterText(
        find.byKey(const Key('deny-reason-r1')),
        'Not in Florida',
      );
      await tap(tester, find.byKey(const Key('deny-with-reason-r1')));
      expect(find.text('Deny Sam Flanker?'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('deny-reason')))
            .controller!
            .text,
        'Not in Florida',
      );
      await tester.tap(find.byKey(const Key('confirm-deny')));
      await tester.pumpAndSettle();
      var deny = requests.lastWhere((r) => r.url.path.endsWith('/deny'));
      expect(deny.url.path, '/v1/admin/join-requests/r1/deny');
      expect(jsonDecode(deny.body), {'reason': 'Not in Florida'});
      expect(find.text('Denied the request from Sam Flanker.'), findsOneWidget);

      await tap(tester, find.byKey(const Key('deny-r2')));
      await tester.tap(find.byKey(const Key('confirm-deny')));
      await tester.pumpAndSettle();
      deny = requests.lastWhere((r) => r.url.path.endsWith('/deny'));
      expect(deny.url.path, '/v1/admin/join-requests/r2/deny');
      expect(jsonDecode(deny.body), isEmpty);
      expect(requests.where((r) => r.url.path.endsWith('/approve')), isEmpty);
      await finish(tester, services);
    });

    testWidgets('members: missing last names first, tagged', (tester) async {
      pending = [];
      final services = await openAdmin(tester, tab: 'people');
      final names = ['Blake', 'chris@example.com', 'Alex Rossi', 'Dana Lee'];
      for (final name in names) {
        await tester.ensureVisible(find.text(name));
      }
      final tops = [for (final n in names) tester.getTopLeft(find.text(n)).dy];
      expect(tops, [...tops]..sort());
      expect(find.text('NO LAST NAME'), findsNWidgets(2));
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('member-blake')),
          matching: find.text('NO LAST NAME'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('member-alex')),
          matching: find.text('NO LAST NAME'),
        ),
        findsNothing,
      );
      // Invites are in the app now, between join requests and members.
      await tester.scrollUntilVisible(
        find.text('INVITE PEOPLE'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('INVITE PEOPLE'), findsOneWidget);
      expect(find.byKey(const Key('make-invite-link')), findsOneWidget);
      expect(find.textContaining('website'), findsNothing);
      await finish(tester, services);
    });

    testWidgets('invite link: make, share, copy, turn off; invite by email', (
      tester,
    ) async {
      pending = [];
      final previous = respond;
      var links = <Map<String, Object?>>[];
      var invited = <Map<String, Object?>>[
        {'email': 'pat@example.com', 'role': 'player'},
        {'email': 'sam@example.com', 'role': 'coach'},
      ];
      respond = (request) {
        final path = request.url.path;
        if (path == '/v1/admin/invite-links' && request.method == 'POST') {
          expect(jsonDecode(request.body), {'expiresInDays': 7});
          links = [
            {
              'id': 'l1',
              'token': 'tok123',
              'expiresAt': '2026-12-02T00:00:00Z',
              'uses': 2,
              'active': true,
            },
          ];
          return http.Response(jsonEncode(links.first), 200);
        }
        if (path == '/v1/admin/invite-links/l1' && request.method == 'DELETE') {
          links = [];
          return http.Response('', 204);
        }
        if (path == '/v1/admin/invite-links') {
          return http.Response(jsonEncode(links), 200);
        }
        if (path.startsWith('/v1/admin/invitations/') &&
            request.method == 'PUT') {
          invited = [
            ...invited,
            {'email': 'new@example.com', 'role': 'player'},
          ];
          return http.Response('{}', 200);
        }
        if (path == '/v1/admin/invitations') {
          return http.Response(jsonEncode(invited), 200);
        }
        return previous(request);
      };
      String? clipboard;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboard = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      final services = await openAdmin(tester, tab: 'people');

      // An admin (not the super admin): invites players only, can't remove a coach.
      await shown(tester, find.byKey(const Key('send-invite')));
      expect(find.byKey(const Key('invite-role-coach')), findsNothing);
      expect(
        await shown(tester, find.byKey(const Key('remove-pat@example.com'))),
        findsOneWidget,
      );
      expect(find.byKey(const Key('remove-sam@example.com')), findsNothing);

      await tap(tester, find.byKey(const Key('invite-days-7')));
      await tap(tester, find.byKey(const Key('make-invite-link')));
      expect(
        find.text('https://www.claymoresrfc.com/invite/tok123'),
        findsOneWidget,
      );
      expect(find.textContaining('2 joined'), findsOneWidget);
      expect(find.byKey(const Key('share-invite-link')), findsOneWidget);

      await tap(tester, find.byKey(const Key('copy-invite-link')));
      expect(find.text('Invite link copied.'), findsOneWidget);
      expect(clipboard, 'https://www.claymoresrfc.com/invite/tok123');

      await tap(tester, find.byKey(const Key('turn-off-invite-link')));
      expect(find.text('Turn this link off?'), findsOneWidget);
      await tap(tester, find.byKey(const Key('confirm-action')));
      expect(find.byKey(const Key('make-invite-link')), findsOneWidget);

      await tester.enterText(find.byKey(const Key('invite-email')), 'nope');
      await tap(tester, find.byKey(const Key('send-invite')));
      expect(find.text('Enter a Google email.'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('invite-email')),
        ' New@Example.com ',
      );
      await tap(tester, find.byKey(const Key('send-invite')));
      final put = requests.lastWhere((r) => r.method == 'PUT');
      expect(put.url.path, '/v1/admin/invitations/new%40example.com');
      expect(jsonDecode(put.body), {'role': 'player'});
      expect(await shown(tester, find.text('new@example.com')), findsOneWidget);
      await finish(tester, services);
    });

    testWidgets('editing a member name sends First Last and handles 400', (
      tester,
    ) async {
      pending = [];
      final services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.text('Blake'));
      expect(find.text('EDIT NAME'), findsOneWidget);
      expect(field(tester, 'first'), 'Blake');
      expect(field(tester, 'last'), '');

      await tap(tester, find.byKey(const Key('save-member-name')));
      expect(find.text('Enter a last name.'), findsOneWidget);
      expect(requests.where((r) => r.method == 'PUT'), isEmpty);

      onName = (_) => http.Response(
        jsonEncode({'error': 'Names are at most 80 characters.'}),
        400,
      );
      await tester.enterText(
        find.byKey(const Key('member-last-name')),
        ' Smith ',
      );
      await tap(tester, find.byKey(const Key('save-member-name')));
      expect(find.text('Names are at most 80 characters.'), findsOneWidget);
      expect(find.text('EDIT NAME'), findsOneWidget);

      onName = (_) {
        people[1] = {
          'subject': 'blake',
          'email': 'blake@example.com',
          'name': 'Blake Smith',
        };
        return http.Response('{}', 200);
      };
      await tap(tester, find.byKey(const Key('save-member-name')));
      final puts = requests.where((r) => r.method == 'PUT').toList();
      expect(puts, hasLength(2));
      expect(puts.last.url.path, '/v1/admin/members/blake/name');
      expect(jsonDecode(puts.last.body), {'name': 'Blake Smith'});
      expect(find.text('EDIT NAME'), findsNothing);
      expect(find.text('Name saved.'), findsOneWidget);
      expect(find.text('Blake Smith'), findsOneWidget);
      expect(await tileText(tester, 'missing-last-name'), '1');
      await finish(tester, services);
    });

    testWidgets('only the super admin changes a member’s role', (tester) async {
      pending = [];
      var services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.text('Dana Lee'));
      expect(find.text('EDIT NAME'), findsOneWidget);
      expect(find.byKey(const Key('member-role-coach')), findsNothing);
      await finish(tester, services);

      role = 'superadmin';
      services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.text('Dana Lee'));
      expect(find.text('EDIT MEMBER'), findsOneWidget);
      await tap(tester, find.byKey(const Key('member-role-coach')));
      expect(find.textContaining('pick lineups'), findsOneWidget);
      await tap(tester, find.byKey(const Key('save-member-name')));
      // One Save: the name didn't change, so only the role is sent.
      expect(requests.where((r) => r.method == 'PUT'), hasLength(1));
      final put = requests.lastWhere((r) => r.method == 'PUT');
      expect(put.url.path, startsWith('/v1/admin/invitations/'));
      expect(jsonDecode(put.body), {'role': 'coach'});
      expect(
        find.text('Role saved. It takes effect within 30 seconds.'),
        findsOneWidget,
      );
      await finish(tester, services);
    });

    testWidgets('editing a member who is gone says so', (tester) async {
      pending = [];
      onName = (_) => http.Response('', 404);
      final services = await openAdmin(tester, tab: 'people');
      await tap(tester, find.text('Dana Lee'));
      expect(field(tester, 'first'), 'Dana');
      expect(field(tester, 'last'), 'Lee');
      await tester.enterText(find.byKey(const Key('member-last-name')), 'Li');
      await tap(tester, find.byKey(const Key('save-member-name')));
      expect(find.text('EDIT NAME'), findsNothing);
      expect(find.text('That member no longer exists.'), findsOneWidget);
      await finish(tester, services);
    });

    test('helpers', () {
      expect(AdminTab.parse('people'), AdminTab.people);
      expect(AdminTab.parse('nope'), AdminTab.matches);
      expect(AdminTab.parse(null), AdminTab.matches);
      expect(
        const AvailabilityCounts(
          available: 14,
          maybe: 3,
          noReply: 9,
        ).compactSummary,
        '14 available · 3 maybe · 9 no reply',
      );
      expect(const AvailabilityCounts().compactSummary, 'No answers yet');
      const a = ClubMember(subject: 'a', email: 'a@x.com', name: 'Ann Bee');
      const b = ClubMember(subject: 'b', email: 'b@x.com', name: 'bob');
      const c = ClubMember(subject: 'c', email: 'c@x.com', name: 'c@x.com');
      const d = ClubMember(subject: 'd', email: 'd@x.com', name: 'Al Zed');
      expect(membersForAdmin([a, b, c, d]).map((m) => m.subject), [
        'b',
        'c',
        'd',
        'a',
      ]);
      expect(missingLastNames([a, b, c, d]), 2);
    });
  });

  group('player dues history', () {
    Map<String, Object?> payment(
      String id,
      int cents, {
      String method = 'cash',
      String? note,
      String? voidedAt,
      String? voidedBy,
      String? voidReason,
    }) => {
      'id': id,
      'amountCents': cents,
      'recordedAt': '2026-11-02T15:00:00Z',
      'method': method,
      'note': note,
      'voidedAt': ?voidedAt,
      'voidedBy': ?voidedBy,
      'voidReason': ?voidReason,
    };

    late List<Map<String, Object?>> payments;
    late http.Response Function(http.Request) onChange;

    setUp(() {
      payments = [
        payment('p1', 10000, method: 'stripe'),
        payment('p2', 2500, method: 'volunteer', note: 'Reffed U12 game'),
        payment(
          'p3',
          5000,
          note: 'Recorded twice',
          voidedAt: '2026-11-03T15:00:00Z',
          voidedBy: 'casey@example.com',
          voidReason: 'Duplicate',
        ),
      ];
      onChange = (_) => http.Response('', 204);
      respond = (request) => switch (request.url.path) {
        '/v1/admin/dues' => http.Response(
          jsonEncode([assessment('d1', 'alex', paid: 12500, credited: 2500)]),
          200,
        ),
        '/v1/admin/members' => http.Response(
          jsonEncode([
            {'subject': 'alex', 'email': 'alex@example.com', 'name': 'Alex'},
          ]),
          200,
        ),
        '/v1/admin/dues/d1' => http.Response(
          detail(
            assessment('d1', 'alex', paid: 12500, credited: 2500),
            payments,
          ),
          200,
        ),
        _ when request.url.path.startsWith('/v1/admin/dues/d1/payments/') =>
          onChange(request),
        _ => http.Response('[]', 200),
      };
    });

    Future<AppServices> openAlex(WidgetTester tester) async {
      final services = await pump(
        tester,
        const AdminPage(initialTab: AdminTab.dues),
      );
      await tester.tap(find.text('2026-27 Season dues · \$125 each'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Alex'));
      await tester.pumpAndSettle();
      return services;
    }

    testWidgets('a paid player opens their history, notes and undone ones', (
      tester,
    ) async {
      final services = await openAlex(tester);
      expect(find.text('PLAYER DUES'), findsOneWidget);
      expect(find.text('Paid in full'), findsOneWidget);
      expect(find.byKey(const Key('record-payment')), findsNothing);
      expect(find.text('\$100.00'), findsOneWidget);
      expect(find.textContaining(RegExp(r'^Card · .*Nov 2')), findsOneWidget);
      expect(
        find.textContaining(RegExp(r'^Volunteered · .*Nov 2')),
        findsOneWidget,
      );
      expect(find.text('Reffed U12 game'), findsOneWidget);
      expect(find.text('Recorded twice'), findsOneWidget);
      expect(
        find.text('Undone by casey@example.com: Duplicate'),
        findsOneWidget,
      );
      final undone = tester.widget<Text>(find.text('\$50.00'));
      expect(undone.style?.decoration, TextDecoration.lineThrough);
      // Two live payments, each with Edit note and Undo; none on the undone.
      expect(find.text('EDIT NOTE'), findsNWidgets(2));
      expect(find.text('UNDO PAYMENT'), findsNWidgets(2));
      await finish(tester, services);
    });

    testWidgets('edit note sends PATCH and handles 400 and 409', (
      tester,
    ) async {
      final services = await openAlex(tester);
      onChange = (_) => http.Response(
        jsonEncode({
          'error':
              'Notes are at most 500 characters, and volunteer or waived '
              'credits need one.',
        }),
        400,
      );
      await tester.tap(find.text('EDIT NOTE').last);
      await tester.pumpAndSettle();
      expect(find.text('Edit note'), findsOneWidget);
      final field = find.byKey(const Key('edit-note'));
      expect(
        tester.widget<TextField>(field).controller!.text,
        'Reffed U12 game',
      );

      // A credit can't lose its note: caught before sending.
      await tester.enterText(field, '  ');
      await tester.tap(find.byKey(const Key('save-note')));
      await tester.pumpAndSettle();
      expect(
        find.text('A volunteer credit needs a note saying what they did.'),
        findsOneWidget,
      );
      expect(requests.where((r) => r.method == 'PATCH'), isEmpty);

      await tester.enterText(field, ' Reffed two U12 games ');
      await tester.tap(find.byKey(const Key('save-note')));
      await tester.pumpAndSettle();
      final patch = requests.lastWhere((r) => r.method == 'PATCH');
      expect(patch.url.path, '/v1/admin/dues/d1/payments/p2');
      expect(jsonDecode(patch.body), {'note': 'Reffed two U12 games'});
      expect(find.textContaining('Notes are at most 500'), findsOneWidget);
      expect(find.text('Edit note'), findsOneWidget);

      onChange = (_) => http.Response('', 204);
      payments[1] = payment(
        'p2',
        2500,
        method: 'volunteer',
        note: 'Reffed two U12 games',
      );
      await tester.tap(find.byKey(const Key('save-note')));
      await tester.pumpAndSettle();
      expect(find.text('Edit note'), findsNothing);
      expect(find.text('Note saved.'), findsOneWidget);
      expect(find.text('Reffed two U12 games'), findsOneWidget);

      onChange = (_) => http.Response(
        jsonEncode({
          'error': "This payment was undone, so its note can't change.",
        }),
        409,
      );
      await tester.tap(find.text('EDIT NOTE').first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('edit-note')), 'Online');
      await tester.tap(find.byKey(const Key('save-note')));
      await tester.pumpAndSettle();
      expect(find.text('Edit note'), findsNothing);
      expect(
        find.text("This payment was undone, so its note can't change."),
        findsOneWidget,
      );
      expect(
        requests.where((r) => r.method == 'PATCH').last.url.path,
        '/v1/admin/dues/d1/payments/p1',
      );
      await finish(tester, services);
    });

    testWidgets('undo needs a reason, posts it, and refreshes the summary', (
      tester,
    ) async {
      final services = await openAlex(tester);
      await tester.tap(find.text('UNDO PAYMENT').last);
      await tester.pumpAndSettle();
      expect(find.text('Undo the \$25.00 payment?'), findsOneWidget);
      expect(find.byKey(const Key('stripe-refund-reminder')), findsNothing);

      await tester.tap(find.byKey(const Key('confirm-undo')));
      await tester.pumpAndSettle();
      expect(find.text('Say why it’s being undone.'), findsOneWidget);
      expect(requests.where((r) => r.url.path.endsWith('/void')), isEmpty);

      // The server also insists on a reason.
      onChange = (_) => http.Response(
        jsonEncode({
          'error': "Say why it's being undone, in at most 500 characters.",
        }),
        400,
      );
      await tester.enterText(
        find.byKey(const Key('undo-reason')),
        'Wrong game',
      );
      await tester.tap(find.byKey(const Key('confirm-undo')));
      await tester.pumpAndSettle();
      expect(find.textContaining('in at most 500 characters'), findsOneWidget);

      onChange = (_) => http.Response('', 204);
      payments[1] = payment(
        'p2',
        2500,
        method: 'volunteer',
        note: 'Reffed U12 game',
        voidedAt: '2026-11-25T15:00:00Z',
        voidedBy: 'casey@example.com',
        voidReason: 'Wrong game',
      );
      final before = requests
          .where((r) => r.url.path == '/v1/admin/dues')
          .length;
      await tester.tap(find.byKey(const Key('confirm-undo')));
      await tester.pumpAndSettle();
      final posts = requests.where((r) => r.url.path.endsWith('/void'));
      expect(posts.last.url.path, '/v1/admin/dues/d1/payments/p2/void');
      expect(jsonDecode(posts.last.body), {'reason': 'Wrong game'});
      expect(find.text('Undid the \$25.00 payment.'), findsOneWidget);
      expect(
        find.text('Undone by casey@example.com: Wrong game'),
        findsOneWidget,
      );
      expect(find.text('UNDO PAYMENT'), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(
        requests.where((r) => r.url.path == '/v1/admin/dues').length,
        before + 1,
      );
      await finish(tester, services);
    });

    testWidgets('undoing a card payment reminds to refund in Stripe; 409', (
      tester,
    ) async {
      final services = await openAlex(tester);
      onChange = (_) => http.Response(
        jsonEncode({'error': 'This payment was already undone.'}),
        409,
      );
      await tester.tap(find.text('UNDO PAYMENT').first);
      await tester.pumpAndSettle();
      expect(find.text('Undo the \$100.00 payment?'), findsOneWidget);
      expect(find.byKey(const Key('stripe-refund-reminder')), findsOneWidget);
      expect(
        find.textContaining('refund the card payment in the Stripe dashboard'),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const Key('undo-reason')), 'Refunded');
      await tester.tap(find.byKey(const Key('confirm-undo')));
      await tester.pumpAndSettle();
      expect(find.text('Undo the \$100.00 payment?'), findsNothing);
      expect(find.text('This payment was already undone.'), findsOneWidget);
      expect(
        requests.where((r) => r.url.path.endsWith('/void')).single.url.path,
        '/v1/admin/dues/d1/payments/p1/void',
      );
      await finish(tester, services);
    });
  });
}
