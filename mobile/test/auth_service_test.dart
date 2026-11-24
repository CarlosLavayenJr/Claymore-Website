import 'dart:async';
import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/data/member_repository.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final base = ApiBase.tryParse('https://api.example.com')!;
final t0 = DateTime.utc(2026, 11, 23, 12);

class FakeGoogle implements IdTokenSource {
  FakeGoogle([this.token = 'google-id-token']);
  String? token;
  int signOuts = 0;

  @override
  bool get supported => true;

  @override
  Future<String?> idToken() async => token;

  @override
  Future<void> signOut() async => signOuts++;
}

String session(String access, String refresh, DateTime expires) => jsonEncode({
  'accessToken': access,
  'accessTokenExpiresAt': expires.toIso8601String(),
  'refreshToken': refresh,
  'user': {
    'subject': 'google-sub-1',
    'name': 'Pat Prop',
    'email': 'pat@example.com',
    'role': 'player',
  },
});

/// A fake API: refresh rotates `refresh-N` → `refresh-N+1` / `access-N+1`.
class FakeAuthServer {
  int refreshCalls = 0;
  final bodies = <String, List<Object?>>{};
  Completer<void>? holdRefresh;
  http.Response Function(http.Request)? onGoogle;
  http.Response Function(http.Request)? onRefresh;
  http.Response Function(http.Request)? onOther;

  late final client = MockClient((request) async {
    final json = request.body.isEmpty ? null : jsonDecode(request.body);
    bodies.putIfAbsent(request.url.path, () => []).add(json);
    switch (request.url.path) {
      case '/v1/auth/mobile/google':
        return onGoogle?.call(request) ??
            http.Response(
              session(
                'access-1',
                'refresh-1',
                t0.add(const Duration(minutes: 15)),
              ),
              200,
            );
      case '/v1/auth/mobile/refresh':
        refreshCalls++;
        await holdRefresh?.future;
        if (onRefresh != null) return onRefresh!(request);
        final n = refreshCalls + 1;
        return http.Response(
          session('access-$n', 'refresh-$n', t0.add(const Duration(hours: 1))),
          200,
        );
      case '/v1/auth/mobile/logout':
        return http.Response('', 204);
      default:
        return onOther?.call(request) ?? http.Response('', 404);
    }
  });
}

void main() {
  late FakeAuthServer server;
  late MemoryTokenStore store;
  late FakeGoogle google;
  late DateTime now;
  late AuthService auth;

  setUp(() {
    server = FakeAuthServer();
    store = MemoryTokenStore();
    google = FakeGoogle();
    now = t0;
    auth = AuthService(
      api: AuthApi(base, client: server.client),
      store: store,
      google: google,
      now: () => now,
    );
  });

  tearDown(() => auth.dispose());

  test(
    'signs in with the Google ID token and stores the refresh token',
    () async {
      await auth.signIn();
      expect(server.bodies['/v1/auth/mobile/google'], [
        {'idToken': 'google-id-token'},
      ]);
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.user!.email, 'pat@example.com');
      expect(store.value, 'refresh-1');
      expect(await auth.accessToken(), 'access-1');
    },
  );

  test('403 not_invited is reported clearly and nothing is stored', () async {
    server.onGoogle = (_) => http.Response('{"error":"not_invited"}', 403);
    await auth.signIn();
    expect(auth.status, AuthStatus.notInvited);
    expect(auth.message, contains('invited'));
    expect(store.value, isNull);
    expect(google.signOuts, 1);
  });

  test(
    '401 from the Google exchange is a failure, not "not invited"',
    () async {
      server.onGoogle = (_) => http.Response('', 401);
      await auth.signIn();
      expect(auth.status, AuthStatus.failed);
    },
  );

  test('cancelling the Google sheet returns to signed out', () async {
    google.token = null;
    await auth.signIn();
    expect(auth.status, AuthStatus.signedOut);
    expect(server.bodies, isEmpty);
  });

  test(
    'refreshes proactively before expiry, once for concurrent callers',
    () async {
      await auth.signIn();
      server.holdRefresh = Completer();
      now = t0.add(const Duration(minutes: 14, seconds: 30)); // inside leeway

      final tokens = Future.wait([
        auth.accessToken(),
        auth.accessToken(),
        auth.refreshAfterUnauthorized('access-1'),
      ]);
      await Future<void>.delayed(Duration.zero);
      server.holdRefresh!.complete();

      expect(await tokens, ['access-2', 'access-2', 'access-2']);
      expect(server.refreshCalls, 1);
      expect(server.bodies['/v1/auth/mobile/refresh'], [
        {'refreshToken': 'refresh-1'},
      ]);
      expect(store.value, 'refresh-2');
    },
  );

  test('a 401 triggers one refresh and the request is retried', () async {
    await auth.signIn();
    final seen = <String?>[];
    server.onOther = (request) {
      final bearer = request.headers['Authorization'];
      seen.add(bearer);
      return bearer == 'Bearer access-2'
          ? http.Response(
              '{"subject":"google-sub-1","name":"Pat Prop","email":"pat@example.com","role":"player"}',
              200,
            )
          : http.Response('', 401);
    };
    final members = MemberRepository(
      ApiClient(base: base, client: server.client, tokens: auth),
    );

    final results = await Future.wait([members.me(), members.me()]);
    expect(results.map((u) => u.name), ['Pat Prop', 'Pat Prop']);
    expect(server.refreshCalls, 1);
    expect(seen.where((b) => b == 'Bearer access-1'), hasLength(2));
    expect(seen.where((b) => b == 'Bearer access-2'), hasLength(2));
  });

  test('a rejected refresh signs out and clears storage', () async {
    await auth.signIn();
    server.onRefresh = (_) => http.Response('', 401);
    expect(await auth.refreshAfterUnauthorized('access-1'), isNull);
    expect(auth.status, AuthStatus.signedOut);
    expect(store.value, isNull);
  });

  test('a 403 not_invited on refresh is surfaced as not invited', () async {
    await auth.signIn();
    server.onRefresh = (_) => http.Response('{"error":"not_invited"}', 403);
    expect(await auth.refreshAfterUnauthorized('access-1'), isNull);
    expect(auth.status, AuthStatus.notInvited);
  });

  test('restores a saved session at launch', () async {
    store.value = 'refresh-1';
    await auth.restore();
    expect(auth.status, AuthStatus.signedIn);
    expect(await auth.accessToken(), 'access-2');
  });

  test('network trouble during restore keeps the saved token', () async {
    store.value = 'refresh-1';
    server.onRefresh = (_) => throw const SocketLikeException();
    await auth.restore();
    expect(auth.status, AuthStatus.failed);
    expect(store.value, 'refresh-1');
  });

  test('sign out revokes the refresh token on the server', () async {
    await auth.signIn();
    await auth.signOut();
    await Future<void>.delayed(Duration.zero);
    expect(auth.status, AuthStatus.signedOut);
    expect(store.value, isNull);
    expect(server.bodies['/v1/auth/mobile/logout'], [
      {'refreshToken': 'refresh-1'},
    ]);
  });

  test('authenticated calls without a session fail with 401', () async {
    final members = MemberRepository(
      ApiClient(base: base, client: server.client, tokens: auth),
    );
    expect(
      members.myDues(),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
    );
  });
}

class SocketLikeException implements Exception {
  const SocketLikeException();
}
