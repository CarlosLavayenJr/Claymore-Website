import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/club_repository.dart';
import '../data/member_repository.dart';
import '../data/standings_repository.dart';
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

/// Everything screens need, handed down once through [AppScope].
///
/// State is plain `ChangeNotifier`/`ValueNotifier`: the app has a handful of
/// shared values (schedule, preview switch, session), go_router already
/// listens to a `Listenable` for auth redirects, and it adds no dependency.
class AppServices {
  AppServices({
    required this.club,
    required this.standings,
    required this.auth,
    required this.members,
    required this.availability,
    required this.prefs,
    this.notifications = const ClubNotifications(),
  });

  final ClubDataController club;
  final StandingsRepository standings;
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

  @override
  bool updateShouldNotify(AppScope oldWidget) => services != oldWidget.services;
}
