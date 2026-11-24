import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/club_repository.dart';
import '../data/member_repository.dart';
import '../data/standings_repository.dart';
import '../data/teams.dart';
import '../features/auth/auth_service.dart';
import '../features/club/notifications.dart';
import '../features/fixtures/availability.dart';

/// The schedule shared by Home, Fixtures and match details.
class ClubDataController extends ChangeNotifier {
  ClubDataController(this.repository) : data = repository.load();

  final ClubRepository repository;
  Future<ClubData> data;

  Future<void> reload() async {
    final request = repository.load();
    data = request;
    notifyListeners();
    await request.then<void>((_) {}, onError: (Object _) {});
  }
}

/// The current-season table, shared by the Home preview and the Standings
/// tab so the app fetches it once.
class StandingsController extends ChangeNotifier {
  StandingsController(this.repository);

  final StandingsRepository repository;
  Future<Standings?>? _current;

  bool get available => repository.available;

  /// Loaded on first use.
  Future<Standings?> get current => _current ??= repository.standings();

  Future<void> reload() async {
    final request = repository.standings();
    _current = request;
    notifyListeners();
    await request.then<void>((_) {}, onError: (Object _) {});
  }
}

/// Everything screens need, handed down once through [AppScope].
///
/// State is plain `ChangeNotifier`/`ValueNotifier`: the app has a handful of
/// shared values (schedule, preview switch, session), go_router already
/// listens to a `Listenable` for auth redirects, and it adds no dependency.
class AppServices {
  AppServices({
    required this.club,
    required this.standings,
    required this.teams,
    required this.auth,
    required this.members,
    required this.availability,
    required this.prefs,
    this.notifications = const ClubNotifications(),
  });

  final ClubDataController club;
  final StandingsRepository standings;

  /// Current-season table shared by Home and Standings.
  late final standingsTable = StandingsController(standings);

  /// Resolves fixture/standings names to clubs and logos.
  final TeamDirectory teams;
  final AuthService auth;

  /// Null when the build has no API base URL.
  final MemberRepository? members;
  final AvailabilityStore availability;
  final SharedPreferencesAsync prefs;
  final ClubNotifications notifications;

  /// Club tab "Player preview" switch; shows availability pickers.
  final playerPreview = ValueNotifier(false);

  void dispose() {
    club.dispose();
    standingsTable.dispose();
    teams.dispose();
    auth.dispose();
    availability.dispose();
    playerPreview.dispose();
  }
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()!.services;

  /// Null outside the app (e.g. a widget pumped alone in a test).
  static AppServices? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppScope>()?.services;

  @override
  bool updateShouldNotify(AppScope oldWidget) => services != oldWidget.services;
}
