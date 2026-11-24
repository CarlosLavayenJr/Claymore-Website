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

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;
  @override
  Future<String?> idToken() async => 'google-id-token';
  @override
  Future<void> signOut() async {}
}

String googleSession() => jsonEncode({
  'accessToken': 'access-1',
  'accessTokenExpiresAt': DateTime.now()
      .add(const Duration(hours: 1))
      .toUtc()
      .toIso8601String(),
  'refreshToken': 'refresh-1',
  'user': {
    'subject': 'google-123',
    'name': 'Pat Prop',
    'email': 'pat@example.com',
    'role': 'player',
  },
});

void main() {
  late List<(String, String, Object?)> requests;
  late http.Response Function(http.Request) respond;

  ({AuthService auth, MemberRepository members}) setUpServices(
    FakeApple apple,
  ) {
    final client = MockClient((request) async {
      requests.add((
        request.method,
        request.url.path,
        request.body.isEmpty ? null : jsonDecode(request.body),
      ));
      return respond(request);
    });
    final auth = AuthService(
      api: AuthApi(base, client: client),
      store: MemoryTokenStore(),
      google: FakeGoogle(),
      apple: apple,
    );
    final members = MemberRepository(
      ApiClient(base: base, client: client, tokens: auth),
    );
    return (auth: auth, members: members);
  }

  setUp(() {
    requests = [];
    respond = (request) => switch (request.url.path) {
      '/v1/auth/mobile/google' => http.Response(googleSession(), 200),
      '/v1/me/identities/apple' => http.Response(
        '{"providers":["apple","google"]}',
        200,
      ),
      '/v1/me/identities' => http.Response('{"providers":["google"]}', 200),
      _ => http.Response('', 204),
    };
  });

  const credential = AppleCredential(
    identityToken: 'apple-jwt',
    rawNonce: 'raw-nonce',
    authorizationCode: 'apple-code',
  );

  test('links the Apple account with its token and nonce', () async {
    final s = setUpServices(FakeApple(credential));
    await s.auth.signIn();
    expect(await s.members.identities(), {'google'});

    expect(await s.auth.linkApple(s.members), LinkAppleResult.linked);
    final link = requests.lastWhere((r) => r.$2 == '/v1/me/identities/apple');
    expect(link.$1, 'POST');
    expect(link.$3, {'identityToken': 'apple-jwt', 'rawNonce': 'raw-nonce'});
  });

  test(
    'an Apple account that belongs to someone else is reported, not linked',
    () async {
      final s = setUpServices(FakeApple(credential));
      await s.auth.signIn();
      respond = (request) => request.url.path == '/v1/me/identities/apple'
          ? http.Response('{"error":"linked_elsewhere"}', 409)
          : http.Response(googleSession(), 200);
      expect(
        await s.auth.linkApple(s.members),
        LinkAppleResult.linkedElsewhere,
      );
    },
  );

  test('closing the Apple sheet sends nothing', () async {
    final s = setUpServices(FakeApple(null));
    await s.auth.signIn();
    final before = requests.length;
    expect(await s.auth.linkApple(s.members), LinkAppleResult.cancelled);
    expect(requests.length, before);
  });

  test('not signed in: linking is unavailable', () async {
    final s = setUpServices(FakeApple(credential));
    expect(await s.auth.linkApple(s.members), LinkAppleResult.unavailable);
  });

  test(
    'deleting a Google account with Apple linked sends the Apple code',
    () async {
      final apple = FakeApple(credential);
      final s = setUpServices(apple);
      await s.auth.signIn();
      respond = (request) => switch (request.url.path) {
        '/v1/me/identities' => http.Response(
          '{"providers":["apple","google"]}',
          200,
        ),
        _ => http.Response('', 204),
      };
      expect(
        await s.auth.deleteAccount(s.members),
        DeleteAccountResult.deleted,
      );
      final delete = requests.lastWhere((r) => r.$1 == 'DELETE');
      expect(delete.$3, {'appleAuthorizationCode': 'apple-code'});
      expect(apple.calls, 1);
    },
  );
}
