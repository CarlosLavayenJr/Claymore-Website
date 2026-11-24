// Shapes of GET /v1/standings and GET /v1/standings/seasons. The API passes
// Sanity documents through, so rows and playoffs are loosely typed: every
// field is optional here and missing numbers read as 0.

int _int(Object? value) => value is num ? value.toInt() : 0;
int? _intOrNull(Object? value) => value is num ? value.toInt() : null;
String _str(Object? value) => value is String ? value.trim() : '';
DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;
List<Map<String, dynamic>> _maps(Object? value) => value is List
    ? value.whereType<Map<String, dynamic>>().toList(growable: false)
    : const [];

bool isClaymoresTeam(String name) => name.toLowerCase().contains('claymores');

class StandingsSeason {
  StandingsSeason.fromJson(Map<String, dynamic> json)
    : seasonLabel = _str(json['seasonLabel']),
      divisionName = _str(json['divisionName']),
      claymoresPosition = _intOrNull(json['claymoresPosition']),
      teamCount = _intOrNull(json['teamCount']),
      lastUpdated = _date(json['lastUpdated']);

  final String seasonLabel, divisionName;
  final int? claymoresPosition, teamCount;
  final DateTime? lastUpdated;

  static List<StandingsSeason> listFromJson(Object? json) =>
      _maps(json)
          .map(StandingsSeason.fromJson)
          .where((season) => season.seasonLabel.isNotEmpty)
          .toList(growable: false);
}

class StandingsRow {
  StandingsRow.fromJson(Map<String, dynamic> json)
    : position = _int(json['position']),
      teamName = _str(json['teamName']),
      pool = _str(json['pool']),
      played = _int(json['played']),
      won = _int(json['won']),
      lost = _int(json['lost']),
      drawn = _int(json['drawn']),
      pointsFor = _int(json['pointsFor']),
      pointsAgainst = _int(json['pointsAgainst']),
      pointsDifference = json['pointsDifference'] is num
          ? _int(json['pointsDifference'])
          : _int(json['pointsFor']) - _int(json['pointsAgainst']),
      bonusPoints = _int(json['bonusPoints']),
      totalPoints = _int(json['totalPoints']);

  final String teamName, pool;
  final int position, played, won, lost, drawn;
  final int pointsFor, pointsAgainst, pointsDifference, bonusPoints;
  final int totalPoints;

  bool get isClaymores => isClaymoresTeam(teamName);
}

enum PlayoffRound {
  quarter('Quarter finals'),
  semi('Semi finals'),
  finals('Finals'),
  other('Playoffs');

  const PlayoffRound(this.label);
  final String label;

  static PlayoffRound parse(String value) => switch (value.toLowerCase()) {
    'quarter' || 'quarterfinal' || 'quarter-final' => quarter,
    'semi' || 'semifinal' || 'semi-final' => semi,
    'final' || 'finals' => finals,
    _ => other,
  };
}

class PlayoffMatch {
  PlayoffMatch.fromJson(Map<String, dynamic> json)
    : round = PlayoffRound.parse(_str(json['round'])),
      label = _str(json['label']).replaceFirst(RegExp(r'\.$'), ''),
      date = _date(json['date']),
      homeTeam = _str(json['homeTeam']),
      awayTeam = _str(json['awayTeam']),
      homeScore = _intOrNull(json['homeScore']),
      awayScore = _intOrNull(json['awayScore']);

  final PlayoffRound round;
  final String label, homeTeam, awayTeam;
  final DateTime? date;
  final int? homeScore, awayScore;

  bool get hasScore => homeScore != null && awayScore != null;
  bool get homeWon => hasScore && homeScore! > awayScore!;
  bool get awayWon => hasScore && awayScore! > homeScore!;
}

class Standings {
  Standings.fromJson(Map<String, dynamic> json)
    : seasonLabel = _str(json['seasonLabel']),
      divisionName = _str(json['divisionName']),
      lastUpdated = _date(json['lastUpdated']) ?? _date(json['updatedAt']),
      rows =
          (_maps(json['rows']).map(StandingsRow.fromJson).toList()
                ..sort((a, b) => a.position.compareTo(b.position)))
              .where((row) => row.teamName.isNotEmpty)
              .toList(growable: false),
      playoffs = _maps(json['playoffs'])
          .map(PlayoffMatch.fromJson)
          .toList(growable: false);

  final String seasonLabel, divisionName;
  final DateTime? lastUpdated;
  final List<StandingsRow> rows;
  final List<PlayoffMatch> playoffs;

  /// Distinct non-empty pools in table order, for the pool column.
  List<String> get pools => {
    for (final row in rows)
      if (row.pool.isNotEmpty) row.pool,
  }.toList(growable: false);

  /// Playoff matches grouped by round, quarter → semi → final, keeping the
  /// API's order (which is by date) inside each round.
  Map<PlayoffRound, List<PlayoffMatch>> get playoffsByRound {
    final grouped = <PlayoffRound, List<PlayoffMatch>>{};
    for (final round in PlayoffRound.values) {
      final matches = playoffs.where((m) => m.round == round).toList();
      if (matches.isNotEmpty) grouped[round] = matches;
    }
    return grouped;
  }
}
