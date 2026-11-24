import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/config.dart';
import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
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

  void load() {
    if (AppConfig.duesEnabled) dues = widget.members.myDues();
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
                  return StatusPanel(
                    message: 'Couldn’t load your dues.',
                    action: FilledButton(
                      onPressed: refresh,
                      child: const Text('RETRY'),
                    ),
                  );
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
        ],
      ),
    );
  }
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
