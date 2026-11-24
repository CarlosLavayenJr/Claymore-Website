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

const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// An HTTP `Date` header value (IMF-fixdate).
String httpDate(DateTime time) {
  final t = time.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${_days[t.weekday - 1]}, ${two(t.day)} ${_months[t.month - 1]} '
      '${t.year} ${two(t.hour)}:${two(t.minute)}:${two(t.second)} GMT';
}

/// A fake API: refresh rotates `refresh-N` → `refresh-N+1` / `access-N+1`.
/// Responses carry the server's clock ([serverNow]) in the `Date` header.
class FakeAuthServer {
  int refreshCalls = 0;
  final bodies = <String, List<Object?>>{};
  Completer<void>? holdRefresh;
  DateTime serverNow = t0;
  bool sendDate = true;
  http.Response Function(http.Request)? onGoogle;
  http.Response Function(http.Request)? onRefresh;
  http.Response Function(http.Request)? onOther;

  http.Response ok(String body) => http.Response(
    body,
    200,
    headers: sendDate ? {'date': httpDate(serverNow)} : const {},
  );

  late final client = MockClient((request) async {
    final json = request.body.isEmpty ? null : jsonDecode(request.body);
    bodies.putIfAbsent(request.url.path, () => []).add(json);
    switch (request.url.path) {
      case '/v1/auth/mobile/google':
        return onGoogle?.call(request) ??
            ok(
              session(
                'access-1',
                'refresh-1',
                serverNow.add(const Duration(minutes: 15)),
              ),
            );
      case '/v1/auth/mobile/refresh':
        refreshCalls++;
        await holdRefresh?.future;
        if (onRefresh != null) return onRefresh!(request);
        final n = refreshCalls + 1;
        return ok(
          session(
            'access-$n',
            'refresh-$n',
            serverNow.add(const Duration(hours: 1)),
          ),
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

  group('session generation', () {
    test('signing out during an in-flight refresh stays signed out', () async {
      await auth.signIn();
      server.holdRefresh = Completer();
      final refreshed = auth.refreshAfterUnauthorized('access-1');
      await Future<void>.delayed(Duration.zero);

      await auth.signOut();
      server.holdRefresh!.complete();

      expect(await refreshed, isNull);
      await Future<void>.delayed(Duration.zero);
      expect(auth.status, AuthStatus.signedOut);
      expect(auth.user, isNull);
      expect(store.value, isNull);
      expect(await auth.accessToken(), isNull);
      // The successor the server issued for the dropped refresh is revoked.
      expect(server.bodies['/v1/auth/mobile/logout'], [
        {'refreshToken': 'refresh-1'},
        {'refreshToken': 'refresh-2'},
      ]);
    });

    test('signing out during the launch restore stays signed out', () async {
      store.value = 'refresh-1';
      server.holdRefresh = Completer();
      final restoring = auth.restore();
      await Future<void>.delayed(Duration.zero);
      expect(auth.status, AuthStatus.restoring);

      await auth.signOut();
      server.holdRefresh!.complete();
      await restoring;

      expect(auth.status, AuthStatus.signedOut);
      expect(store.value, isNull);
    });

    test('a stale refresh failure does not touch the new session', () async {
      await auth.signIn();
      server.holdRefresh = Completer();
      server.onRefresh = (_) => http.Response('', 401);
      final refreshed = auth.refreshAfterUnauthorized('access-1');
      await Future<void>.delayed(Duration.zero);

      await auth.signOut();
      await auth.signIn();
      server.holdRefresh!.complete();
      expect(await refreshed, isNull);

      expect(auth.status, AuthStatus.signedIn);
      expect(store.value, 'refresh-1');
    });

    test('the newest refresh token is stored before it is used', () async {
      await auth.signIn();
      final seenStored = <String?>[];
      server.onRefresh = (request) {
        seenStored.add(store.value);
        final sent = (jsonDecode(request.body) as Map)['refreshToken'];
        final n = int.parse((sent as String).split('-').last) + 1;
        return server.ok(
          session('access-$n', 'refresh-$n', t0.add(const Duration(hours: 1))),
        );
      };
      await auth.refreshAfterUnauthorized('access-1');
      await auth.refreshAfterUnauthorized('access-2');
      expect(server.bodies['/v1/auth/mobile/refresh'], [
        {'refreshToken': 'refresh-1'},
        {'refreshToken': 'refresh-2'},
      ]);
      // Each refresh sent the token that was already persisted.
      expect(seenStored, ['refresh-1', 'refresh-2']);
      expect(store.value, 'refresh-3');
    });
  });

  group('clock skew', () {
    test(
      'a device clock ahead of the server does not refresh at once',
      () async {
        now = t0.add(const Duration(hours: 2));
        await auth.signIn();
        expect(auth.refreshDue, now.add(const Duration(minutes: 14)));
        expect(await auth.accessToken(), 'access-1');
        expect(server.refreshCalls, 0);
      },
    );

    test('a device clock behind the server still refreshes on time', () async {
      now = t0.subtract(const Duration(hours: 2));
      await auth.signIn();
      expect(auth.refreshDue, now.add(const Duration(minutes: 14)));
      now = now.add(const Duration(minutes: 14, seconds: 1));
      expect(await auth.accessToken(), 'access-2');
      expect(server.refreshCalls, 1);
    });

    test(
      'without a Date header the lifetime is assumed to be an hour',
      () async {
        server.sendDate = false;
        await auth.signIn();
        expect(auth.refreshDue, t0.add(const Duration(minutes: 59)));
      },
    );

    test('an already-expired token waits the minimum delay', () async {
      server.onGoogle = (_) =>
          server.ok(session('access-1', 'refresh-1', t0)); // lifetime 0
      await auth.signIn();
      expect(auth.refreshDue, t0.add(const Duration(seconds: 30)));
    });

    testWidgets('the refresh timer never fires at zero repeatedly', (
      tester,
    ) async {
      // Every session the server returns is already expired.
      server.onGoogle = (_) => server.ok(session('access-1', 'refresh-1', t0));
      server.onRefresh = (_) => server.ok(session('access-x', 'refresh-x', t0));
      await auth.signIn();
      await tester.pump(const Duration(seconds: 29));
      expect(server.refreshCalls, 0);
      await tester.pump(const Duration(seconds: 1)); // t = 30s
      expect(server.refreshCalls, 1);
      await tester.pump(const Duration(seconds: 29)); // t = 59s
      expect(server.refreshCalls, 1);
      await tester.pump(const Duration(seconds: 1)); // t = 60s
      expect(server.refreshCalls, 2);
      auth.dispose();
      auth = AuthService(
        api: AuthApi(base, client: server.client),
        store: store,
        now: () => now,
      );
    });
  });

  group('restore retry', () {
    test('a failed restore can be retried and keeps the token', () async {
      store.value = 'refresh-1';
      server.onRefresh = (_) => throw const SocketLikeException();
      await auth.restore();
      expect(auth.status, AuthStatus.failed);
      expect(auth.canRetryRestore, isTrue);
      expect(store.value, 'refresh-1');

      await auth.retryRestore(); // still offline
      expect(auth.status, AuthStatus.failed);
      expect(store.value, 'refresh-1');

      server.onRefresh = null;
      await auth.retryRestore();
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.canRetryRestore, isFalse);
    });

    test('a failed sign-in (no stored token) is not a restore to retry', () {
      server.onGoogle = (_) => http.Response('', 500);
      return auth.signIn().then((_) {
        expect(auth.status, AuthStatus.failed);
        expect(auth.canRetryRestore, isFalse);
      });
    });
  });

  test('an unreadable secure store is cleared and signs out', () async {
    final broken = ThrowingStore();
    final service = AuthService(
      api: AuthApi(base, client: server.client),
      store: broken,
      now: () => now,
    );
    addTearDown(service.dispose);
    await service.restore();
    expect(service.status, AuthStatus.signedOut);
    expect(broken.clears, 1);
    expect(server.refreshCalls, 0);
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

/// A Keystore that lost its key: every read throws.
class ThrowingStore implements TokenStore {
  int clears = 0;

  @override
  Future<String?> read() async => throw StateError('Failed to unwrap key');

  @override
  Future<void> write(String refreshToken) async {}

  @override
  Future<void> clear() async => clears++;
}
