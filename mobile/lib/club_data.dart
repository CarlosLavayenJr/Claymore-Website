import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

class Fixture {
  Fixture(Map<String, dynamic> json)
    : id = (json['id'] ?? json['_id']) as String,
      date = DateTime.parse(json['date'] as String),
      season = (json['season'] as num?)?.toInt(),
      home = json['homeTeam'] as String,
      away = json['awayTeam'] as String,
      homeScore = (json['homeScore'] as num?)?.toInt(),
      awayScore = (json['awayScore'] as num?)?.toInt(),
      status = json['status'] as String? ?? '',
      venue = json['venue'] as String? ?? '',
      kickoff = json['kickoffTime'] as String? ?? '',
      matchType = json['matchType'] as String? ?? '',
      note = json['note'] as String? ?? '',
      homeLogo = _logo(json['homeLogo']),
      awayLogo = _logo(json['awayLogo']);

  final String id, home, away, status, venue, kickoff, note, matchType;
  final DateTime date;
  final int? season, homeScore, awayScore;
  final String? homeLogo, awayLogo;

  static String? _logo(Object? value) {
    final uri = value is String ? Uri.tryParse(value) : null;
    return uri?.scheme == 'https' && uri?.host == 'cdn.sanity.io'
        ? uri!
              .replace(queryParameters: {'w': '96', 'h': '96', 'fit': 'max'})
              .toString()
        : null;
  }

  String get title => '$home vs $away';

  String get statusLabel => switch (status) {
    'played' when homeScore != null && awayScore != null =>
      '$homeScore–$awayScore',
    'played' => 'Played',
    'upcoming' => 'Scheduled',
    'cancelled' => 'Cancelled',
    'forfeit_us' => 'Claymores forfeited',
    'forfeit_them' => 'Opponent forfeited',
    _ => 'Status unavailable',
  };
}

class Practice {
  Practice(Map<String, dynamic>? json)
    : weekday = _field(json, 'weekday', 'Thursday'),
      time = _field(json, 'time', '8–10pm'),
      venue = _field(json, 'venueName', 'Barnett Park'),
      address = _field(
        json,
        'venueAddress',
        '4801 W Colonial Dr, Orlando, FL 32808',
      ),
      note = _field(
        json,
        'seasonalNote',
        'Check with the club for seasonal changes.',
      );

  final String weekday, time, venue, address, note;

  static String _field(
    Map<String, dynamic>? json,
    String name,
    String fallback,
  ) {
    final value = json?[name] as String?;
    return value == null || value.trim().isEmpty ? fallback : value;
  }
}

class ClubData {
  factory ClubData(String payload, {required bool isSnapshot}) {
    final result =
        (jsonDecode(payload) as Map<String, dynamic>)['result']
            as Map<String, dynamic>;
    return ClubData._(
      fixtures: _parseFixtures(result['matches']),
      practice: Practice(result['practice'] as Map<String, dynamic>?),
      isSnapshot: isSnapshot,
    );
  }

  ClubData._({
    required this.fixtures,
    required this.practice,
    required this.isSnapshot,
  });

  final List<Fixture> fixtures;
  final Practice practice;
  final bool isSnapshot;
}

List<Fixture> _parseFixtures(Object? payload) => (payload as List)
    .map((match) => Fixture(match as Map<String, dynamic>))
    .toList(growable: false);

class ClubRepository {
  const ClubRepository({
    this.apiBaseUrl = const String.fromEnvironment('CLAYMORES_API_BASE_URL'),
    this.client,
  });

  final String apiBaseUrl;
  final http.Client? client;

  Future<ClubData> load() async {
    final base = Uri.tryParse(apiBaseUrl.trim());
    if (base == null ||
        !base.hasAuthority ||
        base.host.isEmpty ||
        (base.scheme != 'http' && base.scheme != 'https') ||
        base.userInfo.isNotEmpty ||
        base.hasQuery ||
        base.hasFragment) {
      return _loadFallback();
    }

    final path = base.path.endsWith('/')
        ? base.path.substring(0, base.path.length - 1)
        : base.path;
    final (fixtures, practice) = await (
      _loadApi(base.replace(path: '$path/v1/fixtures'), _parseFixtures),
      _loadApi(
        base.replace(path: '$path/v1/practices/schedule'),
        (payload) => Practice(payload as Map<String, dynamic>),
      ),
    ).wait;
    final fallback = fixtures == null || practice == null
        ? await _loadFallback()
        : null;
    return ClubData._(
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
