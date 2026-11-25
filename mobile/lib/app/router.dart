import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../data/club_repository.dart';
import '../data/teams.dart';
import '../features/admin/admin_page.dart';
import '../features/auth/join_page.dart';
import '../features/club/club_page.dart';
import '../features/fixtures/fixtures_page.dart';
import '../features/fixtures/match_details_page.dart';
import '../features/home/home_page.dart';
import '../features/profile/account_page.dart';
import '../features/profile/dues_detail_page.dart';
import '../features/standings/standings_page.dart';
import '../features/teams/team_page.dart';
import '../shared/widgets.dart';
import 'deep_links.dart';
import 'launch_intro.dart';

/// Tabs live in a [StatefulShellRoute] so each keeps its scroll position and
/// filters. Detail screens (match, account, dues) open on the root navigator
/// with their own app bar and back button, as do team pages (`/team/:slug`).
GoRouter buildRouter() {
  final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: '/home',
    redirect: (context, state) {
      final link = locationForDeepLink(state.uri);
      if (link != null) return link;
      return state.uri.path == '/' ? '/home' : null;
    },
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => ClubShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/home', builder: (_, _) => const HomePage()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/fixtures',
                builder: (_, _) => const FixturesPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/standings',
                builder: (_, _) => const StandingsPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: clubPath,
                builder: (_, state) => ClubPage(
                  checkout: CheckoutReturn.parse(
                    state.uri.queryParameters['checkout'],
                  ),
                ),
                routes: [
                  GoRoute(
                    path: 'join',
                    parentNavigatorKey: rootKey,
                    builder: (_, _) => const JoinPage(),
                  ),
                  GoRoute(
                    path: 'profile',
                    parentNavigatorKey: rootKey,
                    // Older Stripe return links pointed here; dues now live
                    // on the Club tab.
                    redirect: (_, state) {
                      if (state.uri.path != profilePath) return null;
                      final checkout = CheckoutReturn.parse(
                        state.uri.queryParameters['checkout'],
                      );
                      return checkout == null
                          ? null
                          : clubCheckoutLocation(checkout);
                    },
                    builder: (_, _) => const AccountPage(),
                    routes: [
                      GoRoute(
                        path: 'admin',
                        parentNavigatorKey: rootKey,
                        builder: (_, _) => const AdminPage(),
                      ),
                      GoRoute(
                        path: 'dues/:id',
                        parentNavigatorKey: rootKey,
                        builder: (_, state) =>
                            DuesDetailPage(id: state.pathParameters['id']!),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/match/:id',
        builder: (_, state) => MatchDetailsPage(
          id: state.pathParameters['id']!,
          fixture: state.extra is Fixture ? state.extra as Fixture : null,
        ),
      ),
      GoRoute(
        path: '/team/:slug',
        // The Claymores' own "team page" is the Club tab.
        redirect: (_, state) =>
            TeamResolver.isClaymores(state.pathParameters['slug'] ?? '')
            ? clubPath
            : null,
        builder: (_, state) => TeamPage(slug: state.pathParameters['slug']!),
      ),
    ],
  );
}

class ClubShell extends StatelessWidget {
  const ClubShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Row(
        children: [
          Image.asset(
            'assets/crest.png',
            key: appBarCrestKey,
            width: 24,
            height: 37,
          ),
          const SizedBox(width: 12),
          const Text('CLAYMORES RFC'),
        ],
      ),
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: shell.currentIndex,
      onDestinationSelected: (index) =>
          shell.goBranch(index, initialLocation: index == shell.currentIndex),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
        NavigationDestination(
          icon: Icon(Icons.calendar_month_outlined),
          label: 'Fixtures',
        ),
        NavigationDestination(
          icon: Icon(Icons.leaderboard_outlined),
          label: 'Standings',
        ),
        NavigationDestination(icon: Icon(Icons.shield_outlined), label: 'Club'),
      ],
    ),
    body: SafeArea(top: false, child: ContentWidth(child: shell)),
  );
}
