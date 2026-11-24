import 'dart:convert';

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

List<Fixture> parseFixtures(Object? payload) => (payload as List)
    .map((match) => Fixture(match as Map<String, dynamic>))
    .toList(growable: false);
