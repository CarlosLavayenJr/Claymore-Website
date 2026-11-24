import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'models/club.dart';

export 'models/club.dart';

class ClubRepository {
  const ClubRepository({
    this.apiBaseUrl = const String.fromEnvironment('CLAYMORES_API_BASE_URL'),
    this.client,
  });

  final String apiBaseUrl;
  final http.Client? client;

  Future<ClubData> load() async {
    final base = ApiBase.tryParse(apiBaseUrl);
    if (base == null) return _loadFallback();

    final (fixtures, practice) = await (
      _loadApi(base.uri('/v1/fixtures'), parseFixtures),
      _loadApi(
        base.uri('/v1/practices/schedule'),
        (payload) => Practice(payload as Map<String, dynamic>),
      ),
    ).wait;
    final fallback = fixtures == null || practice == null
        ? await _loadFallback()
        : null;
    return ClubData.parts(
      fixtures: fixtures ?? fallback!.fixtures,
      practice: practice ?? fallback!.practice,
      isSnapshot: fixtures == null && fallback!.isSnapshot,
    );
  }

  Future<T?> _loadApi<T>(Uri uri, T Function(Object?) parse) async {
    try {
      final response = await _get(uri);
      // The schedule endpoint returns 404 when Sanity has no public schedule.
      if (response.statusCode != 200) return null;
      return parse(jsonDecode(utf8.decode(response.bodyBytes)));
    } on Exception {
      return null;
    } on TypeError {
      return null;
    }
  }

  Future<ClubData> _loadFallback() async {
    const webLive = bool.fromEnvironment('SANITY_WEB_LIVE');
    if (!kIsWeb || webLive) {
      try {
        final query = await rootBundle.loadString('assets/club.groq');
        final uri = Uri.https(
          'bw1seoll.api.sanity.io',
          '/v2024-01-01/data/query/production',
          {'query': query, 'perspective': 'published'},
        );
        final response = await _get(uri);
        if (response.statusCode == 200) {
          return ClubData(utf8.decode(response.bodyBytes), isSnapshot: false);
        }
      } on Exception {
        // The bundled snapshot keeps the schedule accessible offline.
      } on TypeError {
        // An incompatible CMS response also falls back to the snapshot.
      }
    }
    return ClubData(
      await rootBundle.loadString('assets/club_snapshot.json'),
      isSnapshot: true,
    );
  }

  Future<http.Response> _get(Uri uri) =>
      (client?.get(uri) ?? http.get(uri)).timeout(const Duration(seconds: 8));
}
