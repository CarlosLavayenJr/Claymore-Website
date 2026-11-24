import 'dart:async';

import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/api_base.dart';
import '../data/api_client.dart';
import '../data/auth_api.dart';
import '../data/club_repository.dart';
import '../data/member_repository.dart';
import '../data/standings_repository.dart';
import '../data/teams.dart';
import '../features/auth/auth_platform.dart';
import '../features/auth/auth_service.dart';
import '../features/fixtures/availability.dart';
import 'config.dart';
import 'deep_links.dart';
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
    this.teams,
    this.deepLinks = const Stream.empty(),
  });

  final ClubRepository repository;

  /// Defaults to the configured API (or "unavailable" without one).
  final StandingsRepository? standings;

  /// Defaults to [authFromConfig].
  final AuthService? auth;

  /// Defaults to an API client authorised by [auth], when an API is set.
  final MemberRepository? members;

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

  @override
  void initState() {
    super.initState();
    final prefs = SharedPreferencesAsync();
    final auth = widget.auth ?? authFromConfig();
    final base = ApiBase.tryParse(AppConfig.apiBaseUrl);
    services = AppServices(
      club: ClubDataController(widget.repository),
      standings:
          widget.standings ??
          StandingsRepository(apiBaseUrl: AppConfig.apiBaseUrl),
      teams: widget.teams ?? TeamDirectory(apiBaseUrl: AppConfig.apiBaseUrl),
      auth: auth,
      members:
          widget.members ??
          (base == null
              ? null
              : MemberRepository(ApiClient(base: base, tokens: auth))),
      availability: AvailabilityStore(prefs),
      prefs: prefs,
    );
    unawaited(auth.restore());
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
    ),
  );
}
