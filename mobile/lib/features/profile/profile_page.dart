import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/config.dart';
import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../admin/admin_page.dart';
import '../auth/auth_service.dart';
import 'payment_amount.dart';

String duesLocation(String id) =>
    '$profilePath/dues/${Uri.encodeComponent(id)}';

/// `/club/profile`: who is signed in and their dues. Stripe returns here via
/// `claymores://dues?checkout=returned|cancelled`.
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, this.checkout});

  final CheckoutReturn? checkout;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return Scaffold(
      appBar: AppBar(title: const Text('PROFILE')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: ListenableBuilder(
            listenable: auth,
            builder: (context, _) {
              if (auth.status == AuthStatus.restoring) {
                return const Center(child: CircularProgressIndicator());
              }
              final user = auth.user;
              final members = services.members;
              if (!auth.signedIn || user == null || members == null) {
                return PageList(
                  children: [
                    if (checkout != null) _CheckoutBanner(checkout: checkout!),
                    StatusPanel(
                      message: 'Sign in to see your profile and dues.',
                      action: FilledButton(
                        onPressed: () => context.go('/club'),
                        child: const Text('GO TO CLUB'),
                      ),
                    ),
                  ],
                );
              }
              return _SignedInProfile(
                user: user,
                members: members,
                checkout: checkout,
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SignedInProfile extends StatefulWidget {
  const _SignedInProfile({
    required this.user,
    required this.members,
    required this.checkout,
  });

  final AuthUser user;
  final MemberRepository members;
  final CheckoutReturn? checkout;

  @override
  State<_SignedInProfile> createState() => _SignedInProfileState();
}

class _SignedInProfileState extends State<_SignedInProfile> {
  Future<List<DuesAssessment>>? dues;
  late final AppLifecycleListener lifecycle;

  @override
  void initState() {
    super.initState();
    load();
    // Returning from the browser without the deep link still refreshes.
    lifecycle = AppLifecycleListener(onResume: () => setState(load));
  }

  @override
  void didUpdateWidget(_SignedInProfile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.checkout != widget.checkout) load();
  }

  @override
  void dispose() {
    lifecycle.dispose();
    super.dispose();
  }

  /// Which sign-ins open this account; null until loaded or when it fails.
  Future<Set<String>>? identities;

  void load() {
    if (AppConfig.duesEnabled) dues = widget.members.myDues();
    identities = widget.members.identities();
  }

  Future<void> refresh() async {
    setState(load);
    await dues?.then<void>((_) {}, onError: (Object _) {});
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final user = widget.user;
    final auth = AppScope.of(context).auth;
    return RefreshIndicator(
      onRefresh: refresh,
      child: PageList(
        children: [
          if (widget.checkout != null)
            _CheckoutBanner(checkout: widget.checkout!),
          Panel(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: BrandHeader(
                        eyebrow: user.role == null
                            ? 'Claymores RFC'
                            : 'Claymores RFC · ${user.role}',
                        title: user.displayName,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Image.asset(
                      'assets/crest.png',
                      width: 32,
                      height: 49,
                      excludeFromSemantics: true,
                    ),
                  ],
                ),
                if (user.email != null) ...[
                  const SizedBox(height: 10),
                  Text(user.email!, style: textTheme.bodySmall),
                ],
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () async {
                    await auth.signOut();
                    if (context.mounted) context.go('/club');
                  },
                  child: const Text('SIGN OUT'),
                ),
              ],
            ),
          ),
          if (isClubAdmin(user)) ...[
            const SizedBox(height: 16),
            const ClubAdminEntry(),
          ],
          const SizedBox(height: 24),
          const SectionHeading('SIGN-IN'),
          _SignInMethods(
            members: widget.members,
            identities: identities,
            onLinked: () => setState(load),
          ),
          if (AppConfig.duesEnabled) ...[
            const SizedBox(height: 24),
            const SectionHeading('DUES'),
            FutureBuilder<List<DuesAssessment>>(
              future: dues,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return DuesLoadError(error: snapshot.error, onRetry: refresh);
                }
                final items = snapshot.data!;
                if (items.isEmpty) {
                  return const StatusPanel(
                    message: 'You have no dues assigned.',
                  );
                }
                final owed = items.fold(0, (sum, d) => sum + d.balanceCents);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      owed > 0
                          ? 'Balance due ${formatCents(owed)}'
                          : 'All paid up.',
                      style: textTheme.titleMedium?.copyWith(
                        fontFeatures: tabularFigures,
                      ),
                    ),
                    const SizedBox(height: 10),
                    for (final item in items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: DuesTile(
                          dues: item,
                          onTap: () async {
                            await context.push(duesLocation(item.id));
                            if (mounted) setState(load);
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
          const SizedBox(height: 40),
          const Divider(),
          const SizedBox(height: 8),
          DeleteAccountButton(members: widget.members),
        ],
      ),
    );
  }
}

/// "Club admin" card on the profile, shown to admins only. Opens
/// [adminPath]: dues across the club and join requests.
class ClubAdminEntry extends StatelessWidget {
  const ClubAdminEntry({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Panel(
      key: const Key('club-admin-entry'),
      featured: true,
      padding: EdgeInsets.zero,
      child: Semantics(
        button: true,
        label: 'Club admin: dues and join requests',
        excludeSemantics: true,
        child: InkWell(
          onTap: () => context.push(adminPath),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.admin_panel_settings_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('CLUB ADMIN', style: displayStyle(20)),
                      const SizedBox(height: 2),
                      Text(
                        'Dues, payments and join requests',
                        style: textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: Brand.secondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Why the dues list didn't load. A 404 means dues are switched off on the
/// API, which isn't an error to retry.
class DuesLoadError extends StatelessWidget {
  const DuesLoadError({super.key, required this.error, required this.onRetry});
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final error = this.error;
    if (error is ApiException && error.statusCode == 404) {
      return const StatusPanel(message: 'Dues aren’t available yet.');
    }
    return StatusPanel(
      message: 'Couldn’t load your dues.',
      action: FilledButton(onPressed: onRetry, child: const Text('RETRY')),
    );
  }
}

/// "Delete account" at the bottom of the profile (App Store 5.1.1(v)).
class DeleteAccountButton extends StatefulWidget {
  const DeleteAccountButton({super.key, required this.members});
  final MemberRepository members;

  @override
  State<DeleteAccountButton> createState() => _DeleteAccountButtonState();
}

class _DeleteAccountButtonState extends State<DeleteAccountButton> {
  bool busy = false;

  Future<bool> confirm(bool apple) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Delete your account?'),
          content: Text(
            'Your access to member features ends and you’re signed out on '
            'every device. The club keeps its records of your dues and '
            'payments.'
            '${apple ? ' Apple will ask you to confirm so the club can '
                      'disconnect your Apple ID.' : ''}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('CANCEL'),
            ),
            TextButton(
              key: const Key('confirm-delete-account'),
              style: destructiveButtonStyle,
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('DELETE ACCOUNT'),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> delete() async {
    final auth = AppScope.of(context).auth;
    final apple = auth.user?.subject.startsWith('apple|') ?? false;
    if (!await confirm(apple) || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.maybeOf(context);
    setState(() => busy = true);
    final result = await auth.deleteAccount(widget.members);
    if (mounted) setState(() => busy = false);
    void say(String text) =>
        messenger.showSnackBar(SnackBar(content: Text(text)));
    switch (result) {
      case DeleteAccountResult.deleted:
        say('Your account was deleted');
        router?.go('/club');
      case DeleteAccountResult.lastAdmin:
        say(
          'You’re the club’s only admin. Make another member an admin '
          'before deleting your account.',
        );
      case DeleteAccountResult.sessionEnded:
        say('Your session ended. Sign in again to delete your account.');
      case DeleteAccountResult.failed:
        say(
          'Couldn’t delete your account. Check your connection and try again.',
        );
    }
  }

  @override
  Widget build(BuildContext context) => Align(
    alignment: AlignmentDirectional.centerStart,
    child: TextButton(
      key: const Key('delete-account'),
      style: destructiveButtonStyle,
      onPressed: busy ? null : delete,
      child: Text(busy ? 'DELETING…' : 'DELETE ACCOUNT'),
    ),
  );
}

class _CheckoutBanner extends StatelessWidget {
  const _CheckoutBanner({required this.checkout});
  final CheckoutReturn checkout;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Semantics(
      liveRegion: true,
      child: Panel(
        featured: true,
        child: Text(
          checkout == CheckoutReturn.returned
              ? 'Thanks — payment submitted. Your balance updates after '
                    'Stripe confirms.'
              : 'Checkout cancelled. You weren’t charged.',
        ),
      ),
    ),
  );
}

class DuesTile extends StatelessWidget {
  const DuesTile({super.key, required this.dues, this.onTap});
  final DuesAssessment dues;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    final numbers = textTheme.bodyMedium?.copyWith(
      fontFeatures: tabularFigures,
    );
    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(dues.description, style: textTheme.titleMedium),
                  ),
                  Text(
                    dues.settled ? 'PAID' : formatCents(dues.balanceCents),
                    style: numbers?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [
                  'Assessed ${formatCents(dues.amountCents)}',
                  'paid ${formatCents(dues.paidCents)}',
                  if (dues.dueDate != null)
                    'due ${localizations.formatMediumDate(dues.dueDate!)}',
                ].join(' · '),
                style: textTheme.bodySmall?.copyWith(
                  fontFeatures: tabularFigures,
                ),
              ),
              if (dues.hasPendingCheckout) ...[
                const SizedBox(height: 6),
                Text(
                  'Checkout of ${formatCents(dues.pendingCheckoutCents)} '
                  'in progress',
                  style: textTheme.bodySmall?.copyWith(color: Brand.ink),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The sign-ins that open this account, and a button to link Sign in with
/// Apple (iOS), so it opens this account too, even with "Hide My Email".
class _SignInMethods extends StatefulWidget {
  const _SignInMethods({
    required this.members,
    required this.identities,
    required this.onLinked,
  });

  final MemberRepository members;
  final Future<Set<String>>? identities;
  final VoidCallback onLinked;

  @override
  State<_SignInMethods> createState() => _SignInMethodsState();
}

class _SignInMethodsState extends State<_SignInMethods> {
  bool busy = false;

  Future<void> link() async {
    final auth = AppScope.of(context).auth;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => busy = true);
    final result = await auth.linkApple(widget.members);
    if (!mounted) return;
    setState(() => busy = false);
    final message = switch (result) {
      LinkAppleResult.linked => 'Sign in with Apple now opens this account.',
      LinkAppleResult.linkedElsewhere =>
        'That Apple ID already belongs to another club account. '
            'Ask a club admin to sort it out.',
      LinkAppleResult.cancelled => null,
      LinkAppleResult.sessionEnded => 'Your session ended. Sign in again.',
      LinkAppleResult.failed ||
      LinkAppleResult.unavailable => 'Couldn’t link Apple. Try again.',
    };
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
    if (result == LinkAppleResult.linked) widget.onLinked();
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    final textTheme = Theme.of(context).textTheme;
    return Panel(
      child: FutureBuilder<Set<String>>(
        future: widget.identities,
        builder: (context, snapshot) {
          final providers = snapshot.data ?? const <String>{};
          final hasApple = providers.contains('apple');
          String label(String p) => p == 'apple' ? 'Apple' : 'Google';
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                providers.isEmpty
                    ? 'Sign in with the Google account or Apple ID the club '
                          'invited.'
                    : 'Opens with: ${providers.map(label).join(' and ')}',
                style: textTheme.bodyMedium,
              ),
              if (snapshot.connectionState == ConnectionState.done &&
                  !snapshot.hasError &&
                  !hasApple &&
                  auth.canSignInWithApple) ...[
                const SizedBox(height: 8),
                Text(
                  'Link Sign in with Apple so it opens this account too, '
                  'even if you hide your email from Apple.',
                  style: textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: busy ? null : link,
                  icon: const Icon(Icons.apple),
                  label: Text(busy ? 'LINKING…' : 'LINK SIGN IN WITH APPLE'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
