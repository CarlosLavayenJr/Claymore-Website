import 'dart:async';

import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'package:shared_preferences/shared_preferences.dart';

import '../data/admin_repository.dart';
import '../data/api_base.dart';
import '../data/api_client.dart';
import '../data/auth_api.dart';
import '../data/club_repository.dart';
import '../data/member_repository.dart';
import '../data/standings_repository.dart';
import '../data/teams.dart';
import '../features/auth/auth_platform.dart';
import '../features/auth/auth_service.dart';
import 'config.dart';
import 'deep_links.dart';
import 'launch_intro.dart';
import 'router.dart';
import 'services.dart';
import 'theme.dart';

/// Builds the session from the dart-defines. Disabled unless sign-in is
/// switched on and the API is set, and at least one provider is configured
/// (the Google web client ID, or Sign in with Apple, which is on by default
/// and shown on iOS only). A release build without that config shows no
/// sign-in UI at all.
AuthService authFromConfig() {
  final base = ApiBase.tryParse(AppConfig.apiBaseUrl);
  final google = AppConfig.googleServerClientId.isEmpty
      ? null
      : GoogleIdTokenSource(
          serverClientId: AppConfig.googleServerClientId,
          iosClientId: AppConfig.googleIosClientId,
        );
  final apple = AppConfig.appleSignInEnabled
      ? const NativeAppleCredentialSource()
      : null;
  if (!AppConfig.signInEnabled ||
      base == null ||
      (google == null && apple == null)) {
    return AuthService.disabled();
  }
  return AuthService(
    api: AuthApi(base),
    store: const SecureTokenStore(),
    google: google,
    apple: apple,
  );
}

class ClaymoresApp extends StatefulWidget {
  const ClaymoresApp({
    super.key,
    this.repository = const ClubRepository(),
    this.standings,
    this.auth,
    this.members,
    this.admin,
    this.teams,
    this.deepLinks = const Stream.empty(),
    this.playIntro = true,
    this.duesEnabled = AppConfig.duesEnabled,
  });

  /// Shows the member's dues on the Club tab; see [AppConfig.duesEnabled].
  final bool duesEnabled;

  /// The crest's launch animation (see [LaunchIntro]).
  final bool playIntro;

  final ClubRepository repository;

  /// Defaults to the configured API (or "unavailable" without one).
  final StandingsRepository? standings;

  /// Defaults to [authFromConfig].
  final AuthService? auth;

  /// Defaults to an API client authorised by [auth], when an API is set.
  final MemberRepository? members;

  /// Defaults to an admin client authorised by [auth], when an API is set.
  final AdminRepository? admin;

  /// Defaults to `/v1/teams` from the configured API plus bundled logos.
  final TeamDirectory? teams;

  /// Incoming `claymores://` links; see [platformDeepLinks].
  final Stream<Uri> deepLinks;

  @override
  State<ClaymoresApp> createState() => _ClaymoresAppState();
}

class _ClaymoresAppState extends State<ClaymoresApp> {
  late final AppServices services;
  late final GoRouter router = buildRouter();
  StreamSubscription<Uri>? links;
  late final AppLifecycleListener lifecycle;

  @override
  void initState() {
    super.initState();
    final prefs = SharedPreferencesAsync();
    final auth = widget.auth ?? authFromConfig();
    final base = ApiBase.tryParse(AppConfig.apiBaseUrl);
    final api = base == null ? null : ApiClient(base: base, tokens: auth);
    services = AppServices(
      club: ClubDataController(widget.repository),
      standings:
          widget.standings ??
          StandingsRepository(apiBaseUrl: AppConfig.apiBaseUrl),
      teams: widget.teams ?? TeamDirectory(apiBaseUrl: AppConfig.apiBaseUrl),
      auth: auth,
      members: widget.members ?? (api == null ? null : MemberRepository(api)),
      admin: widget.admin ?? (api == null ? null : AdminRepository(api)),
      prefs: prefs,
      duesEnabled: widget.duesEnabled,
    );
    unawaited(auth.restore());
    // A restore that failed offline at launch is retried when the app comes
    // back to the foreground (the refresh token is still stored).
    lifecycle = AppLifecycleListener(
      onResume: () {
        unawaited(auth.retryRestore());
        unawaited(services.availability.refresh());
      },
    );
    // Inert unless push is configured for this build.
    unawaited(
      services.notifications.attach(
        auth: auth,
        members: services.members,
        prefs: prefs,
        open: (location) => router.push(location),
      ),
    );
    unawaited(services.teams.load());
    links = widget.deepLinks.listen(
      (uri) {
        final location = locationForDeepLink(uri);
        if (location != null) router.go(location);
      },
      onError: (Object _) {
        // A malformed link is ignored; the app stays where it is.
      },
    );
  }

  @override
  void dispose() {
    links?.cancel();
    lifecycle.dispose();
    router.dispose();
    services.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScope(
    services: services,
    child: MaterialApp.router(
      title: 'Claymores RFC',
      debugShowCheckedModeBanner: false,
      theme: buildClaymoresTheme(),
      routerConfig: router,
      builder: (context, child) =>
          LaunchIntro(play: widget.playIntro, child: child!),
    ),
  );
}
