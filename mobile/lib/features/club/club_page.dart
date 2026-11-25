import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/config.dart';
import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../admin/admin_page.dart';
import '../auth/auth_service.dart';
import '../auth/sign_in_card.dart';
import '../profile/full_name_form.dart';
import 'alert_settings.dart';
import 'club_admin_card.dart';
import 'my_dues.dart';

/// The Club tab. Signed in: who you are (gear → account settings), your
/// dues, and for admins a club admin card. Otherwise the sign-in card.
/// Stripe returns here via `claymores://dues?checkout=returned|cancelled`.
class ClubPage extends StatelessWidget {
  const ClubPage({super.key, this.checkout});

  final CheckoutReturn? checkout;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) {
        final banner = checkout == null
            ? null
            : CheckoutBanner(
                checkout: checkout!,
                onDismiss: () => context.go(clubPath),
              );
        final notifications = [
          if (AppConfig.notificationsEnabled) ...[
            const SizedBox(height: 20),
            const SectionHeading('NOTIFICATIONS'),
            Panel(
              child: AlertSettings(
                notifications: services.notifications,
                prefs: services.prefs,
              ),
            ),
          ],
        ];
        final user = auth.user;
        if (auth.status == AuthStatus.signedIn && user != null) {
          return _SignedInClub(
            user: user,
            members: services.members,
            checkout: checkout,
            banner: banner,
            footer: notifications,
          );
        }
        return PageList(
          storageKey: 'club',
          children: [
            ?banner,
            if (auth.enabled) ...[
              const SectionHeading('ACCOUNT'),
              const Panel(child: SignInCard()),
            ] else if (AppConfig.signInEnabled && kDebugMode) ...[
              const SizedBox(height: 20),
              const StatusPanel(
                message: 'Sign-in isn’t configured for this build.',
                detail:
                    'Set CLAYMORES_API_BASE_URL and GOOGLE_SERVER_CLIENT_ID '
                    '(see README). Release builds hide this section.',
              ),
            ],
            ...notifications,
          ],
        );
      },
    );
  }
}

class _SignedInClub extends StatefulWidget {
  const _SignedInClub({
    required this.user,
    required this.members,
    required this.checkout,
    required this.banner,
    required this.footer,
  });

  final AuthUser user;
  final MemberRepository? members;
  final CheckoutReturn? checkout;
  final Widget? banner;
  final List<Widget> footer;

  @override
  State<_SignedInClub> createState() => _SignedInClubState();
}

class _SignedInClubState extends State<_SignedInClub> {
  Future<List<DuesAssessment>>? dues;
  final adminCard = GlobalKey<ClubAdminCardState>();
  late final AppLifecycleListener lifecycle;
  bool duesEnabled = false;

  @override
  void initState() {
    super.initState();
    // Returning from Stripe in the browser without the deep link still
    // refreshes the balance.
    lifecycle = AppLifecycleListener(onResume: () => setState(load));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final enabled = AppScope.of(context).duesEnabled;
    if (dues == null || enabled != duesEnabled) {
      duesEnabled = enabled;
      load();
    }
  }

  @override
  void didUpdateWidget(_SignedInClub oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.checkout != widget.checkout ||
        oldWidget.members != widget.members ||
        oldWidget.user.subject != widget.user.subject) {
      load();
    }
  }

  @override
  void dispose() {
    lifecycle.dispose();
    super.dispose();
  }

  void load() {
    final members = widget.members;
    dues = duesEnabled && members != null ? members.myDues() : null;
  }

  Future<void> refresh() async {
    setState(load);
    await Future.wait<void>([
      if (dues != null) dues!.then<void>((_) {}, onError: (Object _) {}),
      ?adminCard.currentState?.refresh(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final user = widget.user;
    return RefreshIndicator(
      onRefresh: refresh,
      child: PageList(
        storageKey: 'club',
        children: [
          if (user.needsFullName && widget.members != null) ...[
            FullNameCard(user: user, members: widget.members!),
            const SizedBox(height: 16),
          ],
          ?widget.banner,
          Panel(
            padding: const EdgeInsets.fromLTRB(20, 16, 8, 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: BrandHeader(
                      eyebrow: user.role == null
                          ? 'Claymores RFC'
                          : 'Claymores RFC · ${user.role}',
                      title: user.displayName,
                      titleSize: 22,
                    ),
                  ),
                ),
                IconButton(
                  key: const Key('account-settings'),
                  tooltip: 'Account settings',
                  icon: const Icon(Icons.settings_outlined),
                  onPressed: () => context.push(accountPath),
                ),
              ],
            ),
          ),
          if (duesEnabled && widget.members != null) ...[
            const SizedBox(height: 24),
            const SectionHeading('YOUR DUES'),
            _YourDues(
              dues: dues,
              onRetry: () => setState(load),
              onOpen: (item) async {
                await context.push(duesLocation(item.id));
                if (mounted) setState(load);
              },
            ),
          ],
          if (isClubAdmin(user)) ...[
            const SizedBox(height: 24),
            ClubAdminCard(key: adminCard, admin: services.admin),
          ],
          ...widget.footer,
        ],
      ),
    );
  }
}

class _YourDues extends StatelessWidget {
  const _YourDues({
    required this.dues,
    required this.onRetry,
    required this.onOpen,
  });

  final Future<List<DuesAssessment>>? dues;
  final VoidCallback onRetry;
  final void Function(DuesAssessment item) onOpen;

  @override
  Widget build(BuildContext context) => FutureBuilder<List<DuesAssessment>>(
    future: dues,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        );
      }
      if (snapshot.hasError) {
        return DuesLoadError(error: snapshot.error, onRetry: onRetry);
      }
      final items = snapshot.data ?? const <DuesAssessment>[];
      if (items.isEmpty) {
        return const StatusPanel(message: 'You have no dues assigned.');
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              duesBalanceLine(items).toUpperCase(),
              key: const Key('dues-balance'),
              style: displayStyle(28),
            ),
          ),
          const SizedBox(height: 12),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: DuesTile(dues: item, onTap: () => onOpen(item)),
            ),
        ],
      );
    },
  );
}
