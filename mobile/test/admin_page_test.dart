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
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/fixtures/availability.dart';
import 'package:claymores/features/club/my_dues.dart';
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
      availability: AvailabilityStore(prefs),
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
      club: ClubDataController(EmptyClubRepository()),
      standings: StandingsRepository(),
      teams: TeamDirectory.bundled(),
      auth: auth,
      members: MemberRepository(api),
      admin: AdminRepository(api),
      availability: AvailabilityStore(prefs),
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
    final services = await pump(tester, const AdminPage());
    expect(find.text('Only club admins can open this page.'), findsOneWidget);
    expect(requests.where((r) => r.url.path.startsWith('/v1/admin')), isEmpty);
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
    final services = await pump(tester, const AdminPage());

    expect(find.text('2026-27 Season dues · \$125 each'), findsOneWidget);
    expect(
      find.text('1 of 3 paid in full · 1 partly paid · 1 unpaid'),
      findsOneWidget,
    );
    expect(find.text('\$175 collected · \$200 outstanding'), findsOneWidget);
    expect(find.text('No requests waiting.'), findsOneWidget);

    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('blake@example.com'), findsOneWidget);
    expect(find.text('Former member'), findsOneWidget);

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
    final services = await pump(tester, const AdminPage());
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
    final services = await pump(tester, const AdminPage());
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
    final services = await pump(tester, const AdminPage());
    expect(find.text('Dues are switched off'), findsOneWidget);
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
      final services = await pump(tester, const AdminPage());
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
