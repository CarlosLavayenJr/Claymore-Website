import 'dart:convert';

import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/auth_api.dart';
import 'package:claymores/features/auth/auth_platform.dart';
import 'package:claymores/features/auth/auth_service.dart';
import 'package:claymores/features/auth/sign_in_card.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

final base = ApiBase.tryParse('https://api.example.com')!;

class FakeApple implements AppleCredentialSource {
  FakeApple([this.result]);
  AppleCredential? result;

  @override
  bool get supported => true;

  @override
  Future<AppleCredential?> credential() async => result;
}

class FakeGoogle implements IdTokenSource {
  @override
  bool get supported => true;

  @override
  Future<String?> idToken() async => 'google-id-token';

  @override
  Future<void> signOut() async {}
}

String session() => jsonEncode({
  'accessToken': 'access-1',
  'accessTokenExpiresAt': DateTime.now()
      .add(const Duration(hours: 1))
      .toUtc()
      .toIso8601String(),
  'refreshToken': 'refresh-1',
  'user': {
    'subject': 'apple|001.abc',
    'name': 'Pat Prop',
    'email': 'pat@example.com',
    'role': 'player',
  },
});

void main() {
  late List<(String, Object?)> requests;
  late http.Response Function() appleResponse;
  late MemoryTokenStore store;

  AuthService service({AppleCredentialSource? apple, IdTokenSource? google}) {
    final client = MockClient((request) async {
      requests.add((
        request.url.path,
        request.body.isEmpty ? null : jsonDecode(request.body),
      ));
      return appleResponse();
    });
    return AuthService(
      api: AuthApi(base, client: client),
      store: store,
      google: google,
      apple: apple,
    );
  }

  setUp(() {
    requests = [];
    store = MemoryTokenStore();
    appleResponse = () => http.Response(session(), 200);
  });

  group('nonce', () {
    test('is hashed as lowercase hex SHA-256 for Apple', () {
      expect(
        hashNonce('hello'),
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      );
      final raw = newRawNonce();
      expect(hashNonce(raw), sha256.convert(utf8.encode(raw)).toString());
      expect(hashNonce(raw), matches(RegExp(r'^[0-9a-f]{64}$')));
    });

    test('raw nonces are long and fresh each time', () {
      final a = newRawNonce(), b = newRawNonce();
      expect(a, hasLength(64));
      expect(a, isNot(b));
    });
  });

  test(
    'sends identityToken, rawNonce and fullName to the Apple endpoint',
    () async {
      final auth = service(
        apple: FakeApple(
          const AppleCredential(
            identityToken: 'apple-jwt',
            rawNonce: 'raw-nonce',
            fullName: 'Pat Prop',
          ),
        ),
      );
      await auth.signInWithApple();
      expect(requests.map((r) => r.$1), ['/v1/auth/mobile/apple']);
      expect(requests.single.$2, {
        'identityToken': 'apple-jwt',
        'rawNonce': 'raw-nonce',
        'fullName': 'Pat Prop',
      });
      expect(auth.status, AuthStatus.signedIn);
      expect(auth.user!.subject, 'apple|001.abc');
      expect(store.value, 'refresh-1');
      auth.dispose();
    },
  );

  test('omits fullName when Apple sent none', () async {
    final auth = service(
      apple: FakeApple(
        const AppleCredential(identityToken: 'apple-jwt', rawNonce: 'n'),
      ),
    );
    await auth.signInWithApple();
    expect(requests.single.$2, {'identityToken': 'apple-jwt', 'rawNonce': 'n'});
    auth.dispose();
  });

  test('a private relay 403 explains which address to invite', () async {
    appleResponse = () => http.Response(
      '{"error":"not_invited","email":"x7k2@privaterelay.appleid.com"}',
      403,
    );
    final auth = service(
      apple: FakeApple(
        const AppleCredential(identityToken: 'apple-jwt', rawNonce: 'n'),
      ),
    );
    await auth.signInWithApple();
    expect(auth.status, AuthStatus.notInvited);
    expect(
      auth.message,
      'This Apple ID shares a private relay email '
      '(x7k2@privaterelay.appleid.com). Ask a club admin to invite that '
      'address, or sign in with Google.',
    );
    expect(store.value, isNull);
    auth.dispose();
  });

  test('a plain 403 not_invited and a 401 are reported', () async {
    appleResponse = () => http.Response('{"error":"not_invited"}', 403);
    final auth = service(
      apple: FakeApple(
        const AppleCredential(identityToken: 'apple-jwt', rawNonce: 'n'),
      ),
    );
    await auth.signInWithApple();
    expect(auth.status, AuthStatus.notInvited);
    expect(auth.message, contains('Apple ID'));
    expect(auth.message, isNot(contains('relay')));

    appleResponse = () => http.Response('{"error":"invalid_token"}', 401);
    await auth.signInWithApple();
    expect(auth.status, AuthStatus.failed);
    expect(auth.message, contains('Apple sign-in couldn’t be verified'));
    auth.dispose();
  });

  test('cancelling the Apple sheet returns to signed out', () async {
    final auth = service(apple: FakeApple());
    await auth.signInWithApple();
    expect(auth.status, AuthStatus.signedOut);
    expect(requests, isEmpty);
    auth.dispose();
  });

  group('platform', () {
    tearDown(() => debugDefaultTargetPlatformOverride = null);

    test('native Apple sign-in is offered on iOS only', () {
      const source = NativeAppleCredentialSource();
      for (final platform in TargetPlatform.values) {
        debugDefaultTargetPlatformOverride = platform;
        expect(
          source.supported,
          platform == TargetPlatform.iOS,
          reason: platform.name,
        );
      }
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      expect(const NativeAppleCredentialSource(enabled: false).supported, false);
    });

    Future<void> pumpButtons(WidgetTester tester, AuthService auth) =>
        tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: SignInButtons(auth: auth)),
          ),
        );

    testWidgets('the Apple button is hidden on Android', (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final auth = service(
        google: FakeGoogle(),
        apple: const NativeAppleCredentialSource(),
      );
      await pumpButtons(tester, auth);
      expect(find.text('SIGN IN WITH GOOGLE'), findsOneWidget);
      expect(find.byType(SignInWithAppleButton), findsNothing);
      auth.dispose();
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('the Apple button shows next to Google on iOS', (
      tester,
    ) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final auth = service(
        google: FakeGoogle(),
        apple: const NativeAppleCredentialSource(),
      );
      await pumpButtons(tester, auth);
      expect(find.text('SIGN IN WITH GOOGLE'), findsOneWidget);
      expect(find.byType(SignInWithAppleButton), findsOneWidget);
      expect(find.text('Sign in with Apple'), findsOneWidget);
      auth.dispose();
      debugDefaultTargetPlatformOverride = null;
    });
  });
}
