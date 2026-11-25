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
import 'package:claymores/features/admin/admin_page.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/fixtures/availability.dart';
import 'package:claymores/features/profile/profile_page.dart';
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
  int pending = 0,
  String description = '2026-27 Season dues',
}) => {
  'id': id,
  'playerSubject': subject,
  'description': description,
  'amountCents': 12500,
  'dueDate': null,
  'paidCents': paid,
  'balanceCents': 12500 - paid,
  'pendingCheckoutCents': pending,
};

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

  testWidgets('the Club Admin entry shows for admins only', (tester) async {
    var services = await pump(tester, const ProfilePage());
    expect(find.byKey(const Key('club-admin-entry')), findsOneWidget);
    expect(find.text('CLUB ADMIN'), findsOneWidget);
    expect(
      find.bySemanticsLabel('Club admin: dues and join requests'),
      findsOneWidget,
    );
    await finish(tester, services);

    role = 'player';
    services = await pump(tester, const ProfilePage());
    expect(find.text('Casey Coach'.toUpperCase()), findsOneWidget);
    expect(find.byKey(const Key('club-admin-entry')), findsNothing);
    expect(find.text('CLUB ADMIN'), findsNothing);
    await finish(tester, services);
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
      '/v1/admin/dues/d1/payments' =>
        fail ? throw http.ClientException('offline') : http.Response('{}', 200),
      _ => http.Response('[]', 200),
    };
    final services = await pump(tester, const AdminPage());
    await tester.tap(find.text('2026-27 Season dues · \$125 each'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Former member'));
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
}
