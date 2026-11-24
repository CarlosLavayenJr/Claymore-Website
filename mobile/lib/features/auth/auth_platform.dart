import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Where the refresh token lives between launches.
abstract interface class TokenStore {
  Future<String?> read();
  Future<void> write(String refreshToken);
  Future<void> clear();
}

/// Keychain (iOS) / Keystore-backed encrypted storage (Android).
class SecureTokenStore implements TokenStore {
  const SecureTokenStore([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;
  static const _key = 'claymores.refreshToken';

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String refreshToken) =>
      _storage.write(key: _key, value: refreshToken);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.value]);

  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String refreshToken) async => value = refreshToken;

  @override
  Future<void> clear() async => value = null;
}

/// Produces a Google ID token for the API to verify.
abstract interface class IdTokenSource {
  bool get supported;

  /// Null when the person cancels the Google sheet.
  Future<String?> idToken();

  Future<void> signOut();
}

/// google_sign_in 7.x. `serverClientId` is the OAuth web client ID, which
/// makes it the ID token's audience; iOS also needs its own client ID.
class GoogleIdTokenSource implements IdTokenSource {
  GoogleIdTokenSource({required this.serverClientId, this.iosClientId = ''});

  final String serverClientId, iosClientId;
  Future<void>? _initialized;

  @override
  bool get supported =>
      !kIsWeb &&
      serverClientId.isNotEmpty &&
      switch (defaultTargetPlatform) {
        TargetPlatform.android => true,
        TargetPlatform.iOS => iosClientId.isNotEmpty,
        _ => false,
      };

  Future<void> _init() => _initialized ??= GoogleSignIn.instance.initialize(
    serverClientId: serverClientId,
    clientId: defaultTargetPlatform == TargetPlatform.iOS ? iosClientId : null,
  );

  @override
  Future<String?> idToken() async {
    await _init();
    try {
      final account = await GoogleSignIn.instance.authenticate();
      return account.authentication.idToken;
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled ||
          error.code == GoogleSignInExceptionCode.interrupted) {
        return null;
      }
      rethrow;
    }
  }

  @override
  Future<void> signOut() async {
    await _init();
    await GoogleSignIn.instance.signOut();
  }
}

/// What the API needs from a native Apple sign-in.
class AppleCredential {
  const AppleCredential({
    required this.identityToken,
    required this.rawNonce,
    this.fullName,
    this.authorizationCode,
  });

  final String identityToken;

  /// The nonce before hashing. Apple saw only [hashNonce] of it.
  final String rawNonce;

  /// Apple sends the name only the first time a person authorizes the app.
  final String? fullName;

  /// Single-use code the API exchanges to revoke the app's Apple tokens
  /// (sent when deleting an account).
  final String? authorizationCode;
}

/// Produces an Apple identity token for the API to verify.
abstract interface class AppleCredentialSource {
  bool get supported;

  /// Null when the person cancels the Apple sheet.
  Future<AppleCredential?> credential();
}

/// A fresh random nonce for one sign-in attempt (64 URL-safe characters).
String newRawNonce() => generateNonce(length: 64);

/// Lowercase hex SHA-256 of [rawNonce]. Apple puts this value in the identity
/// token's `nonce` claim; the API recomputes it from the raw nonce.
String hashNonce(String rawNonce) =>
    sha256.convert(utf8.encode(rawNonce)).toString();

/// Native Sign in with Apple, offered on iOS only. (Android would need Apple's
/// web flow and a Services ID, which the club doesn't use.)
class NativeAppleCredentialSource implements AppleCredentialSource {
  const NativeAppleCredentialSource({this.enabled = true});

  final bool enabled;

  @override
  bool get supported =>
      enabled && !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  @override
  Future<AppleCredential?> credential() async {
    final rawNonce = newRawNonce();
    try {
      final result = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashNonce(rawNonce),
      );
      final token = result.identityToken;
      if (token == null) {
        throw const SignInWithAppleCredentialsException(
          message: 'Apple returned no identity token.',
        );
      }
      final name = [result.givenName, result.familyName]
          .whereType<String>()
          .map((part) => part.trim())
          .where((part) => part.isNotEmpty)
          .join(' ');
      return AppleCredential(
        identityToken: token,
        rawNonce: rawNonce,
        fullName: name.isEmpty ? null : name,
        authorizationCode: result.authorizationCode.isEmpty
            ? null
            : result.authorizationCode,
      );
    } on SignInWithAppleAuthorizationException catch (error) {
      if (error.code == AuthorizationErrorCode.canceled) return null;
      rethrow;
    }
  }
}
