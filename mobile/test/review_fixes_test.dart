import 'dart:async';
import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/data/club_time.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/club/my_dues.dart';
import 'package:claymores/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
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

class FakeApple implements AppleCredentialSource {
  FakeApple(this.result);
  AppleCredential? result;
  int calls = 0;

  @override
  bool get supported => true;

  @override
  Future<AppleCredential?> credential() async {
    calls++;
    return result;
  }
}

class Offline implements Exception {
  const Offline();
}

/// Sign-in, refresh and `DELETE /v1/me`, with [subject] as the user.
class FakeServer {
  FakeServer({this.subject = 'google-sub-1'});
  final String subject;
  bool offline = false;
  http.Response Function()? onDelete;
  final deletes = <Object?>[];
  final deleteAuth = <String?>[];

  String session(String n) => jsonEncode({
    'accessToken': 'access-$n',
    'accessTokenExpiresAt': DateTime.now()
        .toUtc()
        .add(const Duration(hours: 1))
        .toIso8601String(),
    'refreshToken': 'refresh-$n',
    'user': {'subject': subject, 'name': 'Pat Prop', 'role': 'player'},
  });

  late final client = MockClient((request) async {
    switch (request.url.path) {
      case '/v1/auth/mobile/google' || '/v1/auth/mobile/apple':
        return http.Response(session('1'), 200);
      case '/v1/auth/mobile/refresh':
        if (offline) throw const Offline();
        return http.Response(session('2'), 200);
      case '/v1/auth/mobile/logout':
        return http.Response('', 204);
      case '/v1/me' when request.method == 'DELETE':
        deletes.add(request.body.isEmpty ? null : jsonDecode(request.body));
        deleteAuth.add(request.headers['Authorization']);
        return onDelete?.call() ?? http.Response('', 204);
      default:
        return http.Response('', 404);
    }
  });
}

void main() {
  group('ApiException.fromResponse', () {
    ApiException parse(String body, [int status = 409]) =>
        ApiException.fromResponse(http.Response(body, status));

    test('prefers the error code', () {
      expect(
        parse('{"error":"last_admin","detail":"Only admin"}').error,
        'last_admin',
      );
    });

    test('falls back to ProblemDetails detail, then title', () {
      expect(
        parse(
          '{"type":"about:blank","title":"Conflict",'
          '"detail":"A \$20.00 checkout is already open.","status":409}',
        ).error,
        'A \$20.00 checkout is already open.',
      );
      expect(parse('{"title":"Conflict","status":409}').error, 'Conflict');
      expect(parse('not json').error, isNull);
    });
  });

  test('one bad fixture is skipped and the rest are kept', () {
    final fixtures = parseFixtures([
      {
        'id': 'a',
        'date': '2026-12-05',
        'homeTeam': 'Claymores',
        'awayTeam': 'Daytona',
      },
      {'id': 'b', 'date': 'not a date', 'homeTeam': 'X', 'awayTeam': 'Y'},
      {'id': 'c', 'date': '2026-12-12', 'homeTeam': 'Claymores'},
      'junk',
      {
        '_id': 'd',
        'date': '2026-12-19',
        'homeTeam': 'Tampa',
        'awayTeam': 'Claymores',
      },
    ]);
    expect(fixtures.map((f) => f.id), ['a', 'd']);
    expect(() => parseFixtures({'not': 'a list'}), throwsA(anything));
  });

  test('the timezone database is loaded once', () {
    for (var i = 0; i < 5; i++) {
      clubToday(DateTime.utc(2026, 1, 2, 5));
    }
    expect(clubToday(DateTime.utc(2026, 1, 2, 4, 59)), DateTime(2026, 1, 1));
    expect(timeZoneInitializations, 1);
  });

  testWidgets('a 404 from dues means dues are not available yet', (
    tester,
  ) async {
    Future<void> show(Object error) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DuesLoadError(error: error, onRetry: () {}),
        ),
      ),
    );

    await show(const ApiException(404));
    expect(find.text('Dues aren’t available yet.'), findsOneWidget);
    expect(find.text('RETRY'), findsNothing);

    await show(const ApiException(500));
    expect(find.text('Couldn’t load your dues.'), findsOneWidget);
    expect(find.text('RETRY'), findsOneWidget);
  });

  group('delete account', () {
    late FakeServer server;
    late MemoryTokenStore store;
    late AuthService auth;
    late MemberRepository members;
    FakeApple? apple;

    Future<void> signIn({String subject = 'google-sub-1', FakeApple? fake}) {
      server = FakeServer(subject: subject);
      store = MemoryTokenStore();
      apple = fake;
      auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: store,
        google: FakeGoogle(),
        apple: fake,
      );
      members = MemberRepository(
        ApiClient(base: base, client: server.client, tokens: auth),
      );
      return fake == null ? auth.signIn() : auth.signInWithApple();
    }

    tearDown(() => auth.dispose());

    const appleCredential = AppleCredential(
      identityToken: 'apple-jwt',
      rawNonce: 'n',
      authorizationCode: 'apple-code-1',
    );

    test('204 clears the session and storage', () async {
      await signIn();
      expect(store.value, 'refresh-1');
      expect(await auth.deleteAccount(members), DeleteAccountResult.deleted);
      expect(server.deletes, [null]);
      expect(server.deleteAuth, ['Bearer access-1']);
      expect(auth.status, AuthStatus.signedOut);
      expect(auth.user, isNull);
      expect(store.value, isNull);
    });

    test('409 last_admin keeps the account and session', () async {
      await signIn();
      server.onDelete = () => http.Response('{"error":"last_admin"}', 409);
      expect(await auth.deleteAccount(members), DeleteAccountResult.lastAdmin);
      expect(auth.status, AuthStatus.signedIn);
      expect(store.value, 'refresh-1');
    });

    test('401 ends the session', () async {
      await signIn();
      server.onDelete = () => http.Response('', 401);
      expect(
        await auth.deleteAccount(members),
        DeleteAccountResult.sessionEnded,
      );
      expect(auth.status, AuthStatus.signedOut);
      expect(store.value, isNull);
    });

    test('an Apple account sends a fresh authorization code', () async {
      await signIn(subject: 'apple|001.abc', fake: FakeApple(appleCredential));
      expect(await auth.deleteAccount(members), DeleteAccountResult.deleted);
      expect(apple!.calls, 2); // sign-in, then re-authorization
      expect(server.deletes, [
        {'appleAuthorizationCode': 'apple-code-1'},
      ]);
    });

    test('cancelling Apple still deletes, without the code', () async {
      await signIn(subject: 'apple|001.abc', fake: FakeApple(appleCredential));
      apple!.result = null;
      expect(await auth.deleteAccount(members), DeleteAccountResult.deleted);
      expect(server.deletes, [null]);
    });

    test('a Google account is not asked to use Apple', () async {
      await signIn(fake: FakeApple(appleCredential));
      // Signed in with Apple's sheet but the API says it's a Google subject.
      expect(await auth.deleteAccount(members), DeleteAccountResult.deleted);
      expect(apple!.calls, 1);
      expect(server.deletes, [null]);
    });
  });

  group('app', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    testWidgets('account: delete account confirms, signs out and says so', (
      tester,
    ) async {
      final server = FakeServer();
      final store = MemoryTokenStore();
      final auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: store,
        google: FakeGoogle(),
      );
      final members = MemberRepository(
        ApiClient(base: base, client: server.client, tokens: auth),
      );
      final links = StreamController<Uri>();
      addTearDown(links.close);
      await auth.signIn();
      await tester.pumpWidget(
        ClaymoresApp(
          repository: EmptyClubRepository(),
          auth: auth,
          members: members,
          deepLinks: links.stream,
        ),
      );
      await tester.pumpAndSettle();
      links.add(Uri.parse('claymores://dues'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      expect(find.text('ACCOUNT'), findsOneWidget);

      final delete = find.byKey(const Key('delete-account'));
      await tester.scrollUntilVisible(delete, 200);
      await tester.tap(delete);
      await tester.pumpAndSettle();
      expect(find.text('Delete your account?'), findsOneWidget);
      expect(find.textContaining('dues and payments'), findsOneWidget);

      // Cancel first: nothing happens.
      await tester.tap(find.text('CANCEL'));
      await tester.pumpAndSettle();
      expect(server.deletes, isEmpty);

      await tester.tap(delete);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete-account')));
      await tester.pumpAndSettle();

      expect(server.deletes, hasLength(1));
      expect(find.text('Your account was deleted'), findsOneWidget);
      expect(auth.status, AuthStatus.signedOut);
      expect(store.value, isNull);
    });

    testWidgets('account: the only admin is told why deletion failed', (
      tester,
    ) async {
      final server = FakeServer()
        ..onDelete = () => http.Response('{"error":"last_admin"}', 409);
      final auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: MemoryTokenStore(),
        google: FakeGoogle(),
      );
      final members = MemberRepository(
        ApiClient(base: base, client: server.client, tokens: auth),
      );
      final links = StreamController<Uri>();
      addTearDown(links.close);
      await auth.signIn();
      await tester.pumpWidget(
        ClaymoresApp(
          repository: EmptyClubRepository(),
          auth: auth,
          members: members,
          deepLinks: links.stream,
        ),
      );
      await tester.pumpAndSettle();
      links.add(Uri.parse('claymores://dues'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Account settings'));
      await tester.pumpAndSettle();
      final delete = find.byKey(const Key('delete-account'));
      await tester.scrollUntilVisible(delete, 200);
      await tester.tap(delete);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-delete-account')));
      await tester.pumpAndSettle();

      expect(find.textContaining('only admin'), findsOneWidget);
      expect(auth.status, AuthStatus.signedIn);
    });

    testWidgets('a failed launch restore is retried on resume and by button', (
      tester,
    ) async {
      final server = FakeServer()..offline = true;
      final store = MemoryTokenStore('refresh-1');
      final auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: store,
        google: FakeGoogle(),
      );
      await tester.pumpWidget(
        ClaymoresApp(repository: EmptyClubRepository(), auth: auth),
      );
      await tester.pumpAndSettle();
      expect(auth.status, AuthStatus.failed);
      expect(store.value, 'refresh-1');

      await tester.tap(find.text('Club'));
      await tester.pumpAndSettle();
      final retry = find.byKey(const Key('retry-restore'));
      await tester.scrollUntilVisible(retry, 200);

      // Still offline: the button leaves the token in place.
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(auth.status, AuthStatus.failed);
      expect(store.value, 'refresh-1');

      // Back online, the app returns to the foreground.
      server.offline = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(auth.status, AuthStatus.signedIn);
      expect(find.byKey(const Key('retry-restore')), findsNothing);
    });

    testWidgets('the Try again button restores the session', (tester) async {
      final server = FakeServer()..offline = true;
      final auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: MemoryTokenStore('refresh-1'),
        google: FakeGoogle(),
      );
      await tester.pumpWidget(
        ClaymoresApp(repository: EmptyClubRepository(), auth: auth),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Club'));
      await tester.pumpAndSettle();
      server.offline = false;
      final retry = find.byKey(const Key('retry-restore'));
      await tester.scrollUntilVisible(retry, 200);
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(auth.status, AuthStatus.signedIn);
    });
  });
}
