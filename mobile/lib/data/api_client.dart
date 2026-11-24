import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_base.dart';

/// A non-success API response. [error] is the API's `{"error": "..."}` code
/// or message when the body carries one.
class ApiException implements Exception {
  const ApiException(this.statusCode, [this.error]);

  final int statusCode;
  final String? error;

  static ApiException fromResponse(http.Response response) {
    String? error;
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map && body['error'] is String) {
        error = body['error'] as String;
      }
    } on FormatException {
      // Not JSON; keep the status code only.
    }
    return ApiException(response.statusCode, error);
  }

  @override
  String toString() =>
      'ApiException($statusCode${error == null ? '' : ', $error'})';
}

/// Supplies bearer tokens to [ApiClient]. Implemented by the auth service.
abstract interface class AccessTokenSource {
  /// A token that is valid now, refreshed first if it is about to expire.
  /// Null when nobody is signed in.
  Future<String?> accessToken();

  /// Called after the API rejected [rejected] with 401. Returns a new token
  /// (sharing any refresh already in flight) or null when the session ended.
  Future<String?> refreshAfterUnauthorized(String rejected);
}

/// JSON client for the Claymores API. Authenticated calls attach the bearer
/// token and retry once after a 401 with a refreshed token.
class ApiClient {
  ApiClient({required this.base, http.Client? client, this.tokens})
    : _client = client ?? http.Client();

  final ApiBase base;
  final AccessTokenSource? tokens;
  final http.Client _client;

  static const timeout = Duration(seconds: 15);

  Future<Object?> getJson(
    String path, {
    Map<String, String>? query,
    bool auth = false,
  }) async => _decode(await send('GET', path, query: query, auth: auth));

  Future<Object?> postJson(
    String path,
    Object? body, {
    bool auth = false,
  }) async => _decode(await send('POST', path, body: body, auth: auth));

  Future<http.Response> send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool auth = false,
  }) async {
    final uri = base.uri(path, query);
    if (!auth) return _once(method, uri, body, null);

    final source = tokens;
    final token = await source?.accessToken();
    if (source == null || token == null) throw const ApiException(401);
    var response = await _once(method, uri, body, token);
    if (response.statusCode == 401) {
      final fresh = await source.refreshAfterUnauthorized(token);
      if (fresh == null) throw const ApiException(401);
      response = await _once(method, uri, body, fresh);
    }
    return response;
  }

  Future<http.Response> _once(
    String method,
    Uri uri,
    Object? body,
    String? token,
  ) async {
    final request = http.Request(method, uri)
      ..headers['Accept'] = 'application/json';
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final streamed = await _client.send(request).timeout(timeout);
    return http.Response.fromStream(streamed);
  }

  Object? _decode(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.fromResponse(response);
    }
    if (response.bodyBytes.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }
}
