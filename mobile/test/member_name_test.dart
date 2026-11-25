import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/main.dart';
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

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;
  @override
  Future<String?> idToken() async => 'google-id-token';
  @override
  Future<void> signOut() async {}
}

final base = ApiBase.tryParse('https://api.example.com')!;

/// A fake API whose stored name the sign-in, refresh and PUT share.
class FakeApi {
  FakeApi(this.name);

  String? name;
  final puts = <Object?>[];

  /// Replaces the PUT reply (400s, outages).
  http.Response Function(http.Request)? putReply;

  /// Throws on PUT, like a dropped connection.
  bool offline = false;

  /// Throws on token refresh.
  bool refreshOffline = false;

  late final client = MockClient((request) async {
    switch (request.url.path) {
      case '/v1/auth/mobile/google' || '/v1/auth/mobile/refresh':
        if (refreshOffline && request.url.path.endsWith('refresh')) {
          throw http.ClientException('offline');
        }
        return http.Response(
          jsonEncode({
            'accessToken': 'access-1',
            'accessTokenExpiresAt': DateTime.now()
                .toUtc()
                .add(const Duration(hours: 1))
                .toIso8601String(),
            'refreshToken': 'refresh-1',
            'user': {
              'subject': 'google-1',
              'name': name,
              'email': 'anthony@example.com',
              'role': 'player',
            },
          }),
          200,
        );
      case '/v1/me/name':
        puts.add(jsonDecode(request.body));
        if (offline) throw http.ClientException('offline');
        final reply = putReply;
        if (reply != null) return reply(request);
        name = (jsonDecode(request.body) as Map)['name'] as String;
        return http.Response(jsonEncode({'name': name}), 200);
      case '/v1/me/identities':
        return http.Response('{"providers":["google"]}', 200);
      default:
        return http.Response('[]', 200);
    }
  });
}

Future<({FakeApi api, AuthService auth})> pumpClub(
  WidgetTester tester,
  String? name,
) async {
  SharedPreferencesAsyncPlatform.instance =
      InMemorySharedPreferencesAsync.empty();
  final api = FakeApi(name);
  final auth = AuthService(
    api: AuthApi(base, client: api.client),
    store: MemoryTokenStore(),
    google: FakeGoogle(),
  );
  await auth.signIn();
  await tester.pumpWidget(
    ClaymoresApp(
      repository: EmptyClubRepository(),
      auth: auth,
      members: MemberRepository(
        ApiClient(base: base, client: api.client, tokens: auth),
      ),
      playIntro: false,
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('Club'));
  await tester.pumpAndSettle();
  return (api: api, auth: auth);
}

String fieldText(WidgetTester tester, String key) =>
    tester.widget<TextField>(find.byKey(Key(key))).controller!.text;

const prompt = 'WHAT’S YOUR FULL NAME?';

void main() {
  group('member name helpers', () {
    test('a missing, one-word or email name needs a full name', () {
      expect(needsFullMemberName(null), isTrue);
      expect(needsFullMemberName('  '), isTrue);
      expect(needsFullMemberName('Anthony'), isTrue);
      expect(needsFullMemberName(' Anthony  '), isTrue);
      expect(needsFullMemberName('anthony@example.com'), isTrue);
      expect(needsFullMemberName('Anthony Rossi'), isFalse);
      expect(needsFullMemberName('Mary Ann de la Cruz'), isFalse);
    });

    test('splits into the first word and the rest', () {
      expect(splitMemberName('Anthony'), (first: 'Anthony', last: ''));
      expect(splitMemberName('Mary  Ann de la Cruz'), (
        first: 'Mary',
        last: 'Ann de la Cruz',
      ));
      expect(splitMemberName('anthony@example.com'), (first: '', last: ''));
      expect(splitMemberName(null), (first: '', last: ''));
    });

    test('joins both parts, required, at most 80 characters', () {
      expect(joinMemberName(' Anthony ', ' Rossi '), (
        name: 'Anthony Rossi',
        error: null,
      ));
      expect(joinMemberName('Anthony', ' ').name, isNull);
      expect(joinMemberName('', 'Rossi').error, isNotNull);
      expect(joinMemberName('A' * 40, 'B' * 39).name, hasLength(80));
      expect(joinMemberName('A' * 40, 'B' * 40).error, contains('80'));
    });
  });

  testWidgets('a one-word name shows the prompt, prefilled', (tester) async {
    await pumpClub(tester, 'Anthony');
    expect(find.text(prompt), findsOneWidget);
    expect(
      find.text(
        'Your Google account only gave us part of it. Coaches use it for '
        'lineups and dues.',
      ),
      findsOneWidget,
    );
    expect(fieldText(tester, 'first-name'), 'Anthony');
    expect(fieldText(tester, 'last-name'), '');
    expect(find.text('SAVE'), findsOneWidget);
  });

  testWidgets('a full name shows no prompt', (tester) async {
    await pumpClub(tester, 'Anthony Rossi');
    expect(find.text(prompt), findsNothing);
    expect(find.text('ANTHONY ROSSI'), findsOneWidget);
  });

  testWidgets('both names are required', (tester) async {
    final s = await pumpClub(tester, 'Anthony');
    await tester.tap(find.byKey(const Key('save-name')));
    await tester.pumpAndSettle();
    expect(find.text('Enter your last name.'), findsOneWidget);
    expect(find.text('Enter your first name.'), findsNothing);

    await tester.enterText(find.byKey(const Key('first-name')), ' ');
    await tester.tap(find.byKey(const Key('save-name')));
    await tester.pumpAndSettle();
    expect(find.text('Enter your first name.'), findsOneWidget);
    expect(s.api.puts, isEmpty);
  });

  testWidgets(
    'saving sends the joined name; the prompt goes and the header updates',
    (tester) async {
      final s = await pumpClub(tester, 'Anthony');
      expect(find.text('ANTHONY'), findsOneWidget); // the header
      await tester.enterText(find.byKey(const Key('last-name')), 'Rossi');
      await tester.tap(find.byKey(const Key('save-name')));
      await tester.pumpAndSettle();

      expect(s.api.puts, [
        {'name': 'Anthony Rossi'},
      ]);
      expect(find.text(prompt), findsNothing);
      expect(find.text('ANTHONY ROSSI'), findsOneWidget);
      expect(s.auth.user?.displayName, 'Anthony Rossi');
    },
  );

  testWidgets('the API’s 400 message shows on the form', (tester) async {
    final s = await pumpClub(tester, 'Anthony');
    s.api.putReply = (_) => http.Response(
      '{"error":"Enter your name, at most 80 characters."}',
      400,
    );
    await tester.enterText(find.byKey(const Key('last-name')), 'Rossi');
    await tester.tap(find.byKey(const Key('save-name')));
    await tester.pumpAndSettle();
    expect(
      find.text('Enter your name, at most 80 characters.'),
      findsOneWidget,
    );
    expect(find.text(prompt), findsOneWidget);
    expect(s.auth.user?.name, 'Anthony');
  });

  testWidgets('a network error shows a snackbar and keeps the form', (
    tester,
  ) async {
    final s = await pumpClub(tester, 'Anthony');
    s.api.offline = true;
    await tester.enterText(find.byKey(const Key('last-name')), 'Rossi');
    await tester.tap(find.byKey(const Key('save-name')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Check your connection'), findsOneWidget);
    expect(find.text(prompt), findsOneWidget);
    expect(fieldText(tester, 'last-name'), 'Rossi');
  });

  testWidgets('the account page changes the name', (tester) async {
    final s = await pumpClub(tester, 'Anthony Rossi');
    await tester.tap(find.byKey(const Key('account-settings')));
    await tester.pumpAndSettle();
    expect(find.text('ANTHONY ROSSI'), findsOneWidget);

    await tester.tap(find.byKey(const Key('change-name')));
    await tester.pumpAndSettle();
    expect(find.text('YOUR NAME'), findsWidgets);
    expect(fieldText(tester, 'first-name'), 'Anthony');
    expect(fieldText(tester, 'last-name'), 'Rossi');

    await tester.enterText(find.byKey(const Key('first-name')), 'Tony');
    await tester.enterText(find.byKey(const Key('last-name')), 'Rossi Jr');
    await tester.tap(find.byKey(const Key('save-name')));
    await tester.pumpAndSettle();

    expect(s.api.puts.last, {'name': 'Tony Rossi Jr'});
    expect(find.byKey(const Key('save-name')), findsNothing); // closed
    expect(find.text('TONY ROSSI JR'), findsOneWidget);
    expect(find.text('Saved: Tony Rossi Jr'), findsOneWidget);
  });

  test('refreshUser applies the saved name when the refresh fails', () async {
    final api = FakeApi('Anthony');
    final auth = AuthService(
      api: AuthApi(base, client: api.client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
    );
    await auth.signIn();
    var notified = 0;
    auth.addListener(() => notified++);
    api.refreshOffline = true;
    await auth.refreshUser(name: 'Anthony Rossi');
    expect(auth.signedIn, isTrue);
    expect(auth.user?.displayName, 'Anthony Rossi');
    expect(notified, greaterThan(0));
  });
}
