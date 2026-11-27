import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../teams.dart';
import '../../shared/formats.dart';

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
      kickoff = formatTime(json['kickoffTime'] as String? ?? ''),
      matchType = json['matchType'] as String? ?? '',
      note = json['note'] as String? ?? '',
      competition = (json['competition'] as String?)?.trim() ?? '',
      homeLogo = _logo(json['homeLogo']),
      awayLogo = _logo(json['awayLogo']);

  final String id, home, away, status, venue, kickoff, note, matchType;

  /// The league or event name, e.g. "Florida Rugby Union D3 — Pod B" or
  /// "Annual Highland games". Empty when the source has none.
  final String competition;
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

  /// True when the Claymores are listed as both teams. rugbyfl.com lists the
  /// club's own events (the Highland Games) this way; there is no opponent.
  bool get isClubEvent =>
      TeamResolver.isClaymores(home) && TeamResolver.isClaymores(away);

  /// What to call a club event: its competition name in title case
  /// ("Annual Highland Games"), or "Club event", as on the website.
  String get eventName => competition.isEmpty
      ? 'Club event'
      : competition.replaceAllMapped(
          RegExp(r'\b[a-z]'),
          (m) => m[0]!.toUpperCase(),
        );

  String get title => isClubEvent ? eventName : '$home vs $away';

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
      time = formatTime(_field(json, 'time', '8–10pm')),
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
    return ClubData.parts(
      fixtures: parseFixtures(result['matches']),
      practice: Practice(result['practice'] as Map<String, dynamic>?),
      isSnapshot: isSnapshot,
    );
  }

  ClubData.parts({
    required this.fixtures,
    required this.practice,
    required this.isSnapshot,
  });

  final List<Fixture> fixtures;
  final Practice practice;
  final bool isSnapshot;
}

/// Parses each fixture on its own: one malformed item is skipped (and logged
/// in debug builds) instead of discarding the whole list. A payload that is
/// not a list at all still throws, so callers can fall back.
List<Fixture> parseFixtures(Object? payload) {
  final fixtures = <Fixture>[];
  for (final match in payload as List) {
    try {
      fixtures.add(Fixture(match as Map<String, dynamic>));
    } catch (error) {
      debugPrint('Skipping an invalid fixture: $error');
    }
  }
  return List.unmodifiable(fixtures);
}
