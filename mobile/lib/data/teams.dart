import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'api_client.dart';

/// A club from `GET /v1/teams` (or the bundled list when offline).
class Team {
  const Team({
    required this.name,
    required this.slug,
    this.aliases = const [],
    this.logoUrl,
    this.city,
  });

  Team.fromJson(Map<String, dynamic> json)
    : name = _str(json['name']),
      slug = _str(json['slug']),
      aliases = json['aliases'] is List
          ? (json['aliases'] as List).whereType<String>().toList(
              growable: false,
            )
          : const [],
      logoUrl = sanityLogo(json['logoUrl']),
      city = switch (_str(json['city'])) {
        '' => null,
        final city => city,
      };

  final String name, slug;

  /// Where the club is based ("Lakeland, FL"), from the CMS; null if unset.
  final String? city;
  final List<String> aliases;

  /// A resized PNG from the Sanity CDN, or null.
  final String? logoUrl;

  bool get isClaymores => TeamResolver.isClaymores(name);

  /// Bundled fallback logo, by slug.
  String? get asset => isClaymores ? claymoresCrest : bundledLogos[slug];

  static const claymoresCrest = 'assets/crest.png';

  static const bundledLogos = {
    'brevard-red-eyes': 'assets/teams/brevard.png',
    'daytona-coconuts': 'assets/teams/daytona.png',
    'fort-lauderdale-rfc': 'assets/teams/ft-lauderdale.png',
    'gainesville-hogs': 'assets/teams/gainesville-hogs.png',
    'jacksonville-rugby': 'assets/teams/jacksonville.png',
    'lakeland-lancers': 'assets/teams/lakeland.png',
    'orlando-otters': 'assets/teams/orlando-otters.png',
    'sarasota-rugby-club': 'assets/teams/sarasota.png',
    'tallahassee-rugby': 'assets/teams/tallahassee.png',
    'tampa-bay-krewe': 'assets/teams/tampa.png',
  };
}

String _str(Object? value) => value is String ? value.trim() : '';

/// Only Sanity CDN images, resized and re-encoded as PNG (the CMS also holds
/// HEIF, WebP and GIF logos, which not every platform decodes).
String? sanityLogo(Object? value) {
  final uri = value is String ? Uri.tryParse(value.trim()) : null;
  if (uri == null || uri.scheme != 'https' || uri.host != 'cdn.sanity.io') {
    return null;
  }
  return uri
      .replace(
        queryParameters: {'w': '128', 'h': '128', 'fit': 'max', 'fm': 'png'},
      )
      .toString();
}

/// Port of the API's `TeamNameResolver` (api/src/Claymores.Api/Scraper):
/// Claymores detection, exact normalized name, exact normalized alias, then a
/// guarded token-subset match that must point at exactly one team.
class TeamResolver {
  TeamResolver(Iterable<Team> teams) {
    for (final team in teams) {
      _add(team);
    }
  }

  // Tokens that mark a different side of the same club; a fuzzy match never
  // ignores one of these.
  static const _sideMarkers = {
    'a', 'b', 'c', 'ii', 'iii', '2', '3', '2nd', '2nds', '3rd', '3rds', //
    'seconds', 'thirds', 'reserve', 'reserves', 'development', 'dev', //
    'women', 'womens', 'ladies', 'youth', 'u18', 'u19', 'u20', 'u21', 'u23', //
    'hs', 'academy', 'sevens', '7s',
  };

  final _byName = <String, Team>{};
  final _bySlug = <String, Team>{};
  final _byAlias = <String, Team>{};
  final _fuzzy = <(List<String>, Team)>[];
  Team? _claymores;

  /// First added wins on clashes.
  void _add(Team team) {
    if (team.slug.isNotEmpty) _bySlug.putIfAbsent(team.slug, () => team);
    final name = normalize(team.name);
    if (name.isNotEmpty) {
      _byName.putIfAbsent(name, () => team);
      _fuzzy.add((name.split(' '), team));
    }
    for (final alias in team.aliases) {
      final key = normalize(alias);
      if (key.isEmpty) continue;
      _byAlias.putIfAbsent(key, () => team);
      _fuzzy.add((key.split(' '), team));
    }
    if (_claymores == null && team.isClaymores) _claymores = team;
  }

  static bool isClaymores(String name) =>
      name.toLowerCase().contains('claymore');

  static final _parenthetical = RegExp(r'\([^)]*\)');
  static final _leadingIr = RegExp(r'^\s*ir\s*/');
  static final _nonAlphanumeric = RegExp('[^a-z0-9]+');
  static final _division = RegExp(r'^d[1-4]$');
  static final _year = RegExp(r'^(19|20)[0-9]{2}$');

  /// "Ft. Lauderdale Knights RFC (D3)" → "ft lauderdale knights".
  static String normalize(String input) {
    var text = input.replaceAll(' ', ' ').toLowerCase();
    text = text.replaceAll(_parenthetical, ' ');
    text = text.replaceFirst(_leadingIr, ' ');
    text = text.replaceAll('f.c.', ' ');
    text = text.replaceAll(_nonAlphanumeric, ' ');
    final tokens = text.split(' ').where((t) => t.isNotEmpty).toList();

    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] != 'rugby') continue;
      var length = 1;
      if (i + 2 < tokens.length &&
          tokens[i + 1] == 'football' &&
          tokens[i + 2] == 'club') {
        length = 3;
      } else if (i + 1 < tokens.length && tokens[i + 1] == 'club') {
        length = 2;
      }
      tokens.removeRange(i, i + length);
      i--;
    }
    tokens.removeWhere((token) => token == 'rfc' || token == 'fc');

    while (tokens.length > 1 &&
        (_division.hasMatch(tokens.last) || _year.hasMatch(tokens.last))) {
      tokens.removeLast();
    }
    return tokens.join(' ');
  }

  /// The team with this slug (first added wins), or null.
  Team? bySlug(String slug) => _bySlug[slug];

  Team? resolve(String raw) {
    if (isClaymores(raw) && _claymores != null) return _claymores;

    final key = normalize(raw);
    if (key.isEmpty) return null;
    final exact = _byName[key] ?? _byAlias[key];
    if (exact != null) return exact;

    final input = key.split(' ');
    final inputSet = input.toSet();
    final matches = <String, Team>{};
    for (final (tokens, team) in _fuzzy) {
      // The candidate's tokens must all appear in the input, and be specific.
      if (tokens.length >= input.length || tokens.join(' ').length < 4) {
        continue;
      }
      if (!tokens.every(inputSet.contains)) continue;
      final extra = input.where((token) => !tokens.contains(token));
      if (extra.any(_sideMarkers.contains)) continue;
      matches.putIfAbsent(
        team.slug.isEmpty ? team.name : team.slug,
        () => team,
      );
    }
    return matches.length == 1 ? matches.values.single : null;
  }
}

/// Resolves the team names used by fixtures and standings to clubs, starting
/// from a bundled list and upgrading to `GET /v1/teams` (logo URLs, new
/// aliases) once loaded.
class TeamDirectory extends ChangeNotifier {
  TeamDirectory({String? apiBaseUrl, http.Client? client})
    : _api = switch (ApiBase.tryParse(apiBaseUrl ?? '')) {
        final base? => ApiClient(base: base, client: client),
        null => null,
      };

  /// The bundled list only; never calls the network.
  TeamDirectory.bundled() : _api = null;

  final ApiClient? _api;
  TeamResolver _resolver = TeamResolver(bundledTeams);
  final _cache = <String, Team?>{};
  Future<void>? _loading;

  Team? resolve(String name) =>
      _cache.putIfAbsent(name, () => _resolver.resolve(name));

  /// The team with this URL slug, e.g. for `/team/lakeland-lancers`.
  Team? bySlug(String slug) => _resolver.bySlug(slug);

  /// Loads `/v1/teams` once. Failures keep the bundled list.
  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    final api = _api;
    if (api == null) return;
    try {
      final json = await api.getJson('/v1/teams');
      if (json is! List) return;
      final teams = json
          .whereType<Map<String, dynamic>>()
          .map(Team.fromJson)
          .where((team) => team.name.isNotEmpty)
          .toList();
      if (teams.isEmpty) return;
      // API teams first so their logo URLs win; the bundled list still
      // supplies anything the API lacks.
      _resolver = TeamResolver([...teams, ...bundledTeams]);
      _cache.clear();
      notifyListeners();
    } on Exception {
      // Offline or API down: bundled logos and monograms.
    } on TypeError {
      // Unexpected shape: same.
    }
  }

  /// Snapshot of `GET /v1/teams` (24 Nov 2026), without logo URLs.
  static const bundledTeams = [
    Team(
      name: 'Central Florida Claymores',
      slug: 'central-florida-claymores',
      aliases: ['Claymores', 'IR/Claymores'],
    ),
    Team(
      name: 'Brevard Red Eyes',
      slug: 'brevard-red-eyes',
      aliases: ['Brevard', 'Brevard Old Red Eye RFC'],
    ),
    Team(
      name: 'Daytona Coconuts',
      slug: 'daytona-coconuts',
      aliases: ['Daytona', 'Daytona Beach Coconuts RFC'],
    ),
    Team(
      name: 'Fort Lauderdale RFC',
      slug: 'fort-lauderdale-rfc',
      aliases: [
        'Ft. Lauderdale',
        'Fort Lauderdale',
        'Ft. Lauderdale Knights RFC (D3)',
      ],
    ),
    Team(
      name: 'Gainesville Hogs',
      slug: 'gainesville-hogs',
      aliases: ['Gainesville'],
    ),
    Team(
      name: 'Hilton Head Island Rugby Football Club',
      slug: 'hilton-head-island-rugby-football-club',
      aliases: ['HHIRFC'],
    ),
    Team(
      name: 'Jacksonville Rugby',
      slug: 'jacksonville-rugby',
      aliases: ['Jacksonville', 'Jacksonville D3', 'Jacksonville D4'],
    ),
    Team(
      name: 'Lakeland Lancers',
      slug: 'lakeland-lancers',
      aliases: ['Lakeland'],
    ),
    Team(
      name: 'Naples Hammerheads',
      slug: 'naples-hammerheads',
      aliases: ['Hammerheads D4', 'SWFL Hammerheads RFC'],
    ),
    Team(name: 'Okapi Wanderers', slug: 'okapi-wanderers', aliases: ['Okapi']),
    Team(
      name: 'Orlando Griffins',
      slug: 'orlando-griffins',
      aliases: ['Orlando D4', 'Orlando D3'],
    ),
    Team(
      name: 'Orlando Otters',
      slug: 'orlando-otters',
      aliases: ['Orlando Otters 2026'],
    ),
    Team(
      name: 'Palm Beach Panthers',
      slug: 'palm-beach-panthers',
      aliases: ['Palm Beach Panthers RFC'],
    ),
    Team(
      name: 'Sarasota Rugby Club',
      slug: 'sarasota-rugby-club',
      aliases: ['Sarasota', 'Sarasota Surge RFC'],
    ),
    Team(
      name: 'St Pete Pelicans',
      slug: 'st-pete-pelicans',
      aliases: ['Pelicans', 'Bay Area Pelican RFC (D3)'],
    ),
    Team(
      name: 'Tallahassee Rugby',
      slug: 'tallahassee-rugby',
      aliases: ['Tallahassee', 'FSU B', 'FSU'],
    ),
    Team(
      name: 'Tampa Bay Krewe',
      slug: 'tampa-bay-krewe',
      aliases: ['Tampa', 'Tampa Bay', 'Tampa D4'],
    ),
    Team(
      name: 'Treasure Coast Armada',
      slug: 'treasure-coast-armada',
      aliases: ['Treasure Coast'],
    ),
  ];
}
