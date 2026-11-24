/// A validated API server address (scheme, host, optional path prefix),
/// without the `/v1` suffix. Invalid or empty values mean "no API configured".
class ApiBase {
  ApiBase._(this._server, this._prefix);

  final Uri _server;
  final String _prefix;

  static ApiBase? tryParse(String raw) {
    final base = Uri.tryParse(raw.trim());
    if (base == null ||
        !base.hasAuthority ||
        base.host.isEmpty ||
        (base.scheme != 'http' && base.scheme != 'https') ||
        base.userInfo.isNotEmpty ||
        base.hasQuery ||
        base.hasFragment) {
      return null;
    }
    final path = base.path.endsWith('/')
        ? base.path.substring(0, base.path.length - 1)
        : base.path;
    return ApiBase._(base, path);
  }

  /// Builds `<server><prefix><path>`; [path] starts with `/v1/...`.
  Uri uri(String path, [Map<String, String>? query]) => _server.replace(
    path: '$_prefix$path',
    queryParameters: query == null || query.isEmpty ? null : query,
  );
}
