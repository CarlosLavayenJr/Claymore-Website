import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/club_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

final base = ApiBase.tryParse('https://api.example.com')!;

String b64(Object json) =>
    base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');

/// An unsigned JWT with Google's profile claims (the app only reads them).
final googleToken =
    '${b64({'alg': 'none'})}.'
    '${b64({'name': 'Pat Prop', 'email': 'pat@example.com'})}.sig';

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;

  @override
  Future<String?> idToken() async => googleToken;

  @override
  Future<void> signOut() async {}
}

class FakeApple implements AppleCredentialSource {
  int calls = 0;
  bool cancel = false;

  @override
  bool get supported => true;

  @override
  Future<AppleCredential?> credential() async {
    if (cancel) return null;
    calls++;
    return AppleCredential(
      identityToken: 'apple-jwt-$calls',
      rawNonce: 'nonce-$calls',
      fullName: calls == 1 ? 'Alex Apple' : null,
    );
  }
}

/// Records each request; [routes] answers by path.
class FakeServer {
  final requests = <(String, Object?)>[];
  final routes = <String, http.Response Function()>{
    '/v1/auth/mobile/google': () =>
        http.Response('{"error":"not_invited"}', 403),
    '/v1/auth/mobile/apple': () =>
        http.Response('{"error":"not_invited"}', 403),
    '/v1/auth/mobile/google/request-status': () =>
        http.Response('{"status":"none"}', 200),
    '/v1/auth/mobile/apple/request-status': () =>
        http.Response('{"status":"none"}', 200),
    '/v1/auth/mobile/google/request-access': () =>
        http.Response('{"status":"pending","email":"pat@example.com"}', 202),
    '/v1/auth/mobile/apple/request-access': () => http.Response(
      '{"status":"pending","email":"x7@privaterelay.appleid.com"}',
      202,
    ),
  };

  late final client = MockClient((request) async {
    requests.add((
      request.url.path,
      request.body.isEmpty ? null : jsonDecode(request.body),
    ));
    return routes[request.url.path]?.call() ?? http.Response('', 404);
  });

  List<Object?> bodies(String path) => [
    for (final (p, body) in requests)
      if (p == path) body,
  ];
}

void main() {
  late FakeServer server;

  setUp(() => server = FakeServer());

  group('AuthApi join endpoints', () {
    late AuthApi api;
    setUp(() => api = AuthApi(base, client: server.client));

    Future<JoinReply> send(int status, String body) {
      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response(body, status);
      return api.requestAccessWithGoogle(
        idToken: 't',
        name: '  Pat Prop ',
        phone: ' ',
        message: 'Played at uni',
      );
    }

    test(
      '202 is pending, with the email the request was filed under',
      () async {
        final reply = await send(
          202,
          '{"status":"pending","email":"pat@example.com"}',
        );
        expect(reply.kind, JoinReplyKind.pending);
        expect(reply.email, 'pat@example.com');
        expect(server.bodies('/v1/auth/mobile/google/request-access').single, {
          'idToken': 't',
          'name': 'Pat Prop',
          'message': 'Played at uni',
        });
      },
    );

    test('409, 429, 400 and 401 map to their outcomes', () async {
      expect(
        (await send(409, '{"status":"already_member"}')).kind,
        JoinReplyKind.alreadyMember,
      );
      expect(
        (await send(429, '{"status":"denied_recently"}')).kind,
        JoinReplyKind.deniedRecently,
      );
      final invalid = await send(
        400,
        '{"error":"invalid_request","field":"phone"}',
      );
      expect(invalid.kind, JoinReplyKind.invalid);
      expect(invalid.field, 'phone');
      expect(
        (await send(401, '{"error":"invalid_token"}')).kind,
        JoinReplyKind.invalidToken,
      );
      expect(send(500, ''), throwsA(isA<ApiException>()));
    });

    test('Apple sends the identity token and raw nonce', () async {
      await api.requestAccessWithApple(
        identityToken: 'apple-jwt',
        rawNonce: 'n',
        name: 'Alex',
        phone: '+1 407 555 0100',
      );
      expect(server.bodies('/v1/auth/mobile/apple/request-access').single, {
        'identityToken': 'apple-jwt',
        'rawNonce': 'n',
        'name': 'Alex',
        'phone': '+1 407 555 0100',
      });
    });

    test('request-status states', () async {
      for (final status in ['none', 'pending', 'approved', 'denied']) {
        server.routes['/v1/auth/mobile/google/request-status'] = () =>
            http.Response('{"status":"$status"}', 200);
        expect((await api.requestStatusWithGoogle('t')).name, status);
      }
      expect(server.bodies('/v1/auth/mobile/google/request-status').first, {
        'idToken': 't',
      });
      server.routes['/v1/auth/mobile/apple/request-status'] = () =>
          http.Response('{"status":"weird"}', 200);
      expect(
        await api.requestStatusWithApple(identityToken: 'a', rawNonce: 'n'),
        JoinRequestStatus.none,
      );
      server.routes['/v1/auth/mobile/google/request-status'] = () =>
          http.Response('{"error":"invalid_token"}', 401);
      expect(
        api.requestStatusWithGoogle('t'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
    });
  });

  group('AuthService join flow', () {
    AuthService service({FakeApple? apple}) => AuthService(
      api: AuthApi(base, client: server.client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
      apple: apple,
    );

    test('a not-invited Google sign-in keeps the identity and checks '
        'the request status', () async {
      server.routes['/v1/auth/mobile/google/request-status'] = () =>
          http.Response('{"status":"pending"}', 200);
      final auth = service();
      await auth.signIn();
      expect(auth.status, AuthStatus.notInvited);
      expect(auth.joinIdentity!.name, 'Pat Prop');
      expect(auth.joinIdentity!.email, 'pat@example.com');
      expect(auth.joinState, JoinState.pending);
      expect(server.bodies('/v1/auth/mobile/google/request-status').single, {
        'idToken': googleToken,
      });
      auth.dispose();
    });

    test('approved and denied statuses are surfaced', () async {
      final auth = service();
      for (final (status, state) in [
        ('approved', JoinState.approved),
        ('denied', JoinState.denied),
        ('none', JoinState.none),
      ]) {
        server.routes['/v1/auth/mobile/google/request-status'] = () =>
            http.Response('{"status":"$status"}', 200);
        await auth.signIn();
        expect(auth.joinState, state, reason: status);
      }
      auth.dispose();
    });

    test('sending a request: 202, 409, 429, 400, 401', () async {
      final auth = service();
      await auth.signIn();
      expect(auth.joinState, JoinState.none);

      expect(await auth.requestToJoin(name: ''), isA<JoinError>());
      expect(server.bodies('/v1/auth/mobile/google/request-access'), isEmpty);

      expect(await auth.requestToJoin(name: 'Pat Prop'), isNull);
      expect(auth.joinState, JoinState.pending);
      expect(auth.joinEmail, 'pat@example.com');

      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"status":"already_member"}', 409);
      expect(await auth.requestToJoin(name: 'Pat Prop'), isNull);
      expect(auth.joinState, JoinState.alreadyMember);

      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"status":"denied_recently"}', 429);
      expect(await auth.requestToJoin(name: 'Pat Prop'), isNull);
      expect(auth.joinState, JoinState.deniedRecently);

      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"error":"invalid_request","field":"phone"}', 400);
      final invalid = await auth.requestToJoin(name: 'Pat', phone: 'abc');
      expect(invalid!.field, 'phone');

      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"error":"invalid_token"}', 401);
      final expired = await auth.requestToJoin(name: 'Pat');
      expect(expired!.message, contains('expired'));
      expect(auth.joinIdentity, isNull);
      expect(auth.message, contains('expired'));
      auth.dispose();
    });

    test('Apple: no automatic status check; each call gets a fresh nonce, '
        'and the relay message stays', () async {
      server.routes['/v1/auth/mobile/apple'] = () => http.Response(
        '{"error":"not_invited","email":"x7@privaterelay.appleid.com"}',
        403,
      );
      final apple = FakeApple();
      final auth = service(apple: apple);
      await auth.signInWithApple();
      expect(auth.status, AuthStatus.notInvited);
      expect(auth.joinState, JoinState.unknown);
      expect(auth.joinIdentity!.name, 'Alex Apple');
      expect(auth.joinIdentity!.email, 'x7@privaterelay.appleid.com');
      expect(auth.message, contains('private relay'));
      expect(server.bodies('/v1/auth/mobile/apple/request-status'), isEmpty);

      await auth.checkJoinStatus();
      expect(auth.joinState, JoinState.none);
      expect(await auth.requestToJoin(name: 'Alex Apple'), isNull);
      expect(auth.joinState, JoinState.pending);
      expect(apple.calls, 3);
      expect(server.bodies('/v1/auth/mobile/apple/request-status').single, {
        'identityToken': 'apple-jwt-2',
        'rawNonce': 'nonce-2',
      });
      expect(server.bodies('/v1/auth/mobile/apple/request-access').single, {
        'identityToken': 'apple-jwt-3',
        'rawNonce': 'nonce-3',
        'name': 'Alex Apple',
      });
      expect(auth.message, contains('private relay'));

      apple.cancel = true;
      final cancelled = await auth.requestToJoin(name: 'Alex Apple');
      expect(cancelled!.message, contains('cancelled'));
      auth.dispose();
    });
  });

  group('Join screen', () {
    setUp(() {
      SharedPreferencesAsyncPlatform.instance =
          InMemorySharedPreferencesAsync.empty();
    });

    Future<AuthService> openJoin(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: MemoryTokenStore(),
        google: FakeGoogle(),
      );
      await tester.pumpWidget(
        ClaymoresApp(repository: EmptyClubRepository(), auth: auth),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Club'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign in with Google'));
      await tester.pumpAndSettle();
      return auth;
    }

    testWidgets('a not-invited sign-in opens the form; sending shows '
        'Request sent', (tester) async {
      await openJoin(tester);
      expect(find.text('JOIN THE CLUB'), findsOneWidget);
      expect(find.text('REQUEST TO JOIN'), findsOneWidget);
      final name = tester.widget<TextField>(find.byKey(const Key('join-name')));
      expect(name.controller!.text, 'Pat Prop');
      expect(find.text('Tell us about your rugby experience'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('join-phone')),
        '407 555 0100',
      );
      await tester.enterText(
        find.byKey(const Key('join-message')),
        'Flanker, 3 seasons',
      );
      await tester.ensureVisible(find.text('SEND REQUEST'));
      await tester.tap(find.text('SEND REQUEST'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('join-pending')), findsOneWidget);
      expect(find.text('REQUEST SENT'), findsOneWidget);
      expect(find.textContaining('pat@example.com'), findsOneWidget);
      expect(server.bodies('/v1/auth/mobile/google/request-access').single, {
        'idToken': googleToken,
        'name': 'Pat Prop',
        'phone': '407 555 0100',
        'message': 'Flanker, 3 seasons',
      });

      // Back on the Club tab the notice reflects the pending request.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('REQUEST PENDING'), findsOneWidget);
      expect(find.text('VIEW REQUEST'), findsOneWidget);
    });

    testWidgets('a 400 marks the field', (tester) async {
      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"error":"invalid_request","field":"phone"}', 400);
      await openJoin(tester);
      await tester.ensureVisible(find.text('SEND REQUEST'));
      await tester.tap(find.text('SEND REQUEST'));
      await tester.pumpAndSettle();
      expect(
        find.text('Enter a valid phone number, or leave it blank.'),
        findsOneWidget,
      );
    });

    testWidgets('a returning applicant sees approved, then signs in', (
      tester,
    ) async {
      server.routes['/v1/auth/mobile/google/request-status'] = () =>
          http.Response('{"status":"approved"}', 200);
      await openJoin(tester);
      expect(find.byKey(const Key('join-approved')), findsOneWidget);
      expect(find.text('YOU’RE APPROVED — SIGN IN'), findsOneWidget);

      server.routes['/v1/auth/mobile/google'] = () => http.Response(
        jsonEncode({
          'accessToken': 'a',
          'accessTokenExpiresAt': DateTime.now()
              .add(const Duration(hours: 1))
              .toUtc()
              .toIso8601String(),
          'refreshToken': 'r',
          'user': {'subject': 's', 'name': 'Pat Prop'},
        }),
        200,
      );
      await tester.tap(find.text('Sign in with Google'));
      await tester.pumpAndSettle();
      expect(find.text('YOU’RE IN'), findsOneWidget);
    });

    testWidgets('a 409 says to just sign in; 429 asks them to wait', (
      tester,
    ) async {
      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"status":"already_member"}', 409);
      final auth = await openJoin(tester);
      await tester.ensureVisible(find.text('SEND REQUEST'));
      await tester.tap(find.text('SEND REQUEST'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('join-member')), findsOneWidget);

      server.routes['/v1/auth/mobile/google/request-access'] = () =>
          http.Response('{"status":"denied_recently"}', 429);
      await auth.requestToJoin(name: 'Pat');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('join-denied-recently')), findsOneWidget);
    });
  });
}

class EmptyClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async =>
      ClubData('{"result":{"matches":[],"practice":null}}', isSnapshot: false);
}
