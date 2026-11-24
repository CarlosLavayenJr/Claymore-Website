import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'api_client.dart';
import 'models/standings.dart';

export 'models/standings.dart';

/// Thrown when the build has no `CLAYMORES_API_BASE_URL`.
class StandingsUnavailable implements Exception {
  const StandingsUnavailable();
}

class StandingsRepository {
  StandingsRepository({String? apiBaseUrl, http.Client? client})
    : _api = switch (ApiBase.tryParse(apiBaseUrl ?? '')) {
        final base? => ApiClient(base: base, client: client),
        null => null,
      };

  final ApiClient? _api;

  bool get available => _api != null;

  ApiClient get _client => _api ?? (throw const StandingsUnavailable());

  Future<List<StandingsSeason>> seasons() async => StandingsSeason.listFromJson(
    await _client.getJson('/v1/standings/seasons'),
  );

  /// The current table, or the one for [season] (`YYYY-YYYY`). Null when the
  /// API has no standings for that season (404).
  Future<Standings?> standings({String? season}) async {
    try {
      final json = await _client.getJson(
        '/v1/standings',
        query: season == null ? null : {'season': season},
      );
      return json is Map<String, dynamic> ? Standings.fromJson(json) : null;
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }
}
