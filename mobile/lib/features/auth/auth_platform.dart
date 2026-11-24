import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';

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
