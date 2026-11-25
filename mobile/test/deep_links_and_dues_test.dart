import 'dart:async';
import 'dart:convert';

import 'package:claymores/app/deep_links.dart';
import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/profile/dues_detail_page.dart';
import 'package:claymores/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;
  @override
  Future<String?> idToken() async => 'google-id-token';
  @override
  Future<void> signOut() async {}
}

class StaticToken implements AccessTokenSource {
  @override
  Future<String?> accessToken() async => 'token';

  @override
  Future<String?> refreshAfterUnauthorized(String rejected) async => null;
}

DuesAssessment dues({int balance = 10000, int pending = 0}) =>
    DuesAssessment.fromJson({
      'id': 'd1',
      'playerSubject': 's',
      'description': 'Season dues',
      'amountCents': 15000,
      'dueDate': null,
      'paidCents': 15000 - balance,
      'balanceCents': balance,
      'pendingCheckoutCents': pending,
    });

void main() {
  group('locationForDeepLink', () {
    test('maps Stripe return links to the Club tab', () {
      expect(
        locationForDeepLink(Uri.parse('claymores://dues?checkout=returned')),
        '/club?checkout=returned',
      );
      expect(
        locationForDeepLink(Uri.parse('claymores://dues?checkout=cancelled')),
        '/club?checkout=cancelled',
      );
      expect(
        locationForDeepLink(Uri.parse('claymores:///dues?checkout=returned')),
        '/club?checkout=returned',
      );
      expect(
        locationForDeepLink(Uri.parse('/dues?checkout=returned')),
        '/club?checkout=returned',
      );
    });

    test('drops unknown checkout values and ignores other links', () {
      expect(
        locationForDeepLink(Uri.parse('claymores://dues?checkout=hacked')),
        '/club',
      );
      expect(locationForDeepLink(Uri.parse('claymores://other')), isNull);
      expect(locationForDeepLink(Uri.parse('/home')), isNull);
      expect(
        locationForDeepLink(Uri.parse('https://evil.example/x/dues')),
        isNull,
      );
    });
  });

  testWidgets('a checkout deep link opens the Club tab with its notice', (
    tester,
  ) async {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    final links = StreamController<Uri>();
    addTearDown(links.close);
    await tester.pumpWidget(
      ClaymoresApp(repository: EmptyClubRepository(), deepLinks: links.stream),
    );
    await tester.pumpAndSettle();

    links.add(Uri.parse('claymores://dues?checkout=cancelled'));
    await tester.pumpAndSettle();
    expect(find.text('CLAYMORES RFC'), findsOneWidget); // the tab shell
    expect(find.textContaining('Checkout cancelled'), findsOneWidget);

    links.add(Uri.parse('claymores://dues?checkout=returned'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Your balance updates after Stripe confirms'),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Your balance updates after Stripe confirms'),
      findsNothing,
    );
    // Push isn't configured, so the notification switches stay hidden.
    expect(find.text('NOTIFICATIONS'), findsNothing);
  });

  testWidgets('signed in, the Stripe return shows the banner and refreshes '
      'dues, also on resume and from the old profile link', (tester) async {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    var duesLoads = 0;
    var paid = false;
    final client = MockClient((request) async {
      switch (request.url.path) {
        case '/v1/auth/mobile/google' || '/v1/auth/mobile/refresh':
          return http.Response(
            jsonEncode({
              'accessToken': 'access-1',
              'accessTokenExpiresAt': DateTime.now()
                  .toUtc()
                  .add(const Duration(hours: 1))
                  .toIso8601String(),
              'refreshToken': 'refresh-1',
              'user': {'subject': 's', 'name': 'Pat Prop', 'role': 'player'},
            }),
            200,
          );
        case '/v1/dues/mine':
          duesLoads++;
          return http.Response(
            jsonEncode([
              {
                'id': 'd1',
                'playerSubject': 's',
                'description': 'Season dues',
                'amountCents': 15000,
                'paidCents': paid ? 15000 : 5000,
                'balanceCents': paid ? 0 : 10000,
              },
            ]),
            200,
          );
        default:
          return http.Response('[]', 200);
      }
    });
    final base = ApiBase.tryParse('https://api.example.com')!;
    final auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    await auth.signIn();
    final links = StreamController<Uri>();
    addTearDown(links.close);
    await tester.pumpWidget(
      ClaymoresApp(
        repository: EmptyClubRepository(),
        auth: auth,
        members: MemberRepository(
          ApiClient(base: base, client: client, tokens: auth),
        ),
        deepLinks: links.stream,
        duesEnabled: true,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Club'));
    await tester.pumpAndSettle();
    expect(find.text('\$100.00 DUE'), findsOneWidget);
    final loads = duesLoads;

    paid = true;
    links.add(Uri.parse('claymores://dues?checkout=returned'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Your balance updates after Stripe confirms'),
      findsOneWidget,
    );
    expect(duesLoads, loads + 1);
    // The Club tab lists upcoming matches above your dues.
    await tester.scrollUntilVisible(
      find.text('ALL PAID UP'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('ALL PAID UP'), findsOneWidget);
    expect(find.text('SIGN OUT'), findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(duesLoads, loads + 2);

    // A link to the old profile location with a checkout lands here too.
    final router = GoRouter.of(tester.element(find.text('ALL PAID UP')));
    router.go('/club/profile?checkout=cancelled');
    await tester.pumpAndSettle();
    expect(find.textContaining('Checkout cancelled'), findsOneWidget);
    expect(find.text('ACCOUNT'), findsNothing);

    // Disposing the app disposes the auth service (and its refresh timer).
    await tester.pumpWidget(const SizedBox());
  });

  group('PayDuesForm', () {
    late List<Map<String, Object?>> posted;
    late List<Uri> launched;
    late MemberRepository members;

    setUp(() {
      posted = [];
      launched = [];
      members = MemberRepository(
        ApiClient(
          base: ApiBase.tryParse('https://api.example.com')!,
          tokens: StaticToken(),
          client: MockClient((request) async {
            posted.add({
              'path': request.url.path,
              ...jsonDecode(request.body) as Map<String, dynamic>,
            });
            return http.Response(
              '{"url":"https://checkout.stripe.com/c/pay/cs_test_1"}',
              200,
            );
          }),
        ),
      );
    });

    Future<void> pumpForm(WidgetTester tester, DuesAssessment item) =>
        tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: PayDuesForm(
                dues: item,
                members: members,
                launcher: (url) async {
                  launched.add(url);
                  return true;
                },
                onStarted: () {},
              ),
            ),
          ),
        );

    testWidgets('defaults to the full balance and validates edits', (
      tester,
    ) async {
      await pumpForm(tester, dues());
      expect(find.text('100.00'), findsOneWidget);
      expect(find.text(r'PAY $100.00'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '0.25');
      await tester.pump();
      expect(find.text(r'The minimum card payment is $0.50.'), findsOneWidget);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );

      await tester.enterText(find.byType(TextField), '40');
      await tester.pump();
      await tester.tap(find.text(r'PAY $40.00'));
      await tester.pumpAndSettle();
      expect(posted.single, {
        'path': '/v1/dues/d1/checkout-session',
        'amountCents': 4000,
      });
      expect(launched.single.host, 'checkout.stripe.com');
      expect(find.textContaining('after Stripe confirms'), findsOneWidget);
    });

    testWidgets('a pending checkout disables entry and offers Resume', (
      tester,
    ) async {
      await pumpForm(tester, dues(pending: 2500));
      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.enabled, isFalse);
      expect(find.textContaining(r'checkout for $25.00'), findsOneWidget);
      await tester.tap(find.text('RESUME PAYMENT'));
      await tester.pumpAndSettle();
      expect(posted.single['amountCents'], 2500);
    });
  });
}
