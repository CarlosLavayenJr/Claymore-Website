import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';
import '../auth/auth_service.dart';
import '../fixtures/fixture_card.dart' show FixtureBadge;
import '../profile/payment_amount.dart';
import 'dues_summary.dart';
import 'record_payment_sheet.dart';

/// `/club/profile/admin`.
const adminPath = '$profilePath/admin';

/// Whether [user] can open the club admin screens.
bool isClubAdmin(AuthUser? user) => user?.role?.toLowerCase() == 'admin';

/// `/club/profile/admin`: dues across the club, recording payments by hand,
/// and pending join requests. The API enforces the admin role; the app only
/// hides the entry for everyone else.
class AdminPage extends StatelessWidget {
  const AdminPage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return Scaffold(
      appBar: AppBar(title: const Text('CLUB ADMIN')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: ListenableBuilder(
            listenable: auth,
            builder: (context, _) {
              if (auth.status == AuthStatus.restoring) {
                return const Center(child: CircularProgressIndicator());
              }
              final admin = services.admin;
              final Widget? blocked = !auth.signedIn
                  ? StatusPanel(
                      message: 'Sign in as a club admin to manage the club.',
                      action: FilledButton(
                        onPressed: () => context.go('/club'),
                        child: const Text('GO TO CLUB'),
                      ),
                    )
                  : !isClubAdmin(auth.user)
                  ? const StatusPanel(
                      message: 'Only club admins can open this page.',
                    )
                  : admin == null
                  ? const StatusPanel(
                      message: 'Club admin isn’t available in this build.',
                    )
                  : null;
              if (blocked != null) return PageList(children: [blocked]);
              return _AdminBody(admin: admin!);
            },
          ),
        ),
      ),
    );
  }
}

/// Dues plus the member names that label them. [members] is null when the
/// member list didn't load; names then fall back to "Club member".
class _DuesBoard {
  const _DuesBoard(this.groups, this.members);
  final List<DuesGroup> groups;
  final Map<String, ClubMember>? members;

  String label(String subject) {
    final members = this.members;
    if (members == null) return 'Club member';
    return members[subject]?.label ?? 'Former member';
  }
}

class _AdminBody extends StatefulWidget {
  const _AdminBody({required this.admin});
  final AdminRepository admin;

  @override
  State<_AdminBody> createState() => _AdminBodyState();
}

class _AdminBodyState extends State<_AdminBody> {
  Future<_DuesBoard>? dues;
  Future<List<AdminJoinRequest>>? requests;

  /// Dues groups the admin opened; kept across refreshes.
  final expanded = <String>{};

  /// Join requests with an approve/deny in flight.
  final deciding = <String>{};

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(_AdminBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.admin != widget.admin) load();
  }

  void load() {
    dues = loadDues();
    requests = widget.admin.joinRequests();
  }

  Future<_DuesBoard> loadDues() async {
    final members = widget.admin.members().then<List<ClubMember>?>(
      (list) => list,
      onError: (Object _) => null,
    );
    final all = await widget.admin.allDues();
    final list = await members;
    return _DuesBoard(
      summarizeDues(all),
      list == null ? null : {for (final m in list) m.subject: m},
    );
  }

  Future<void> refresh() async {
    setState(load);
    await Future.wait<Object?>([
      dues!.then<Object?>((v) => v, onError: (Object _) => null),
      requests!.then<Object?>((v) => v, onError: (Object _) => null),
    ]);
  }

  Future<void> record(DuesAssessment item, String label, String group) async {
    final messenger = ScaffoldMessenger.of(context);
    final cents = await showRecordPaymentSheet(
      context,
      admin: widget.admin,
      dues: item,
      memberLabel: label,
      description: group,
    );
    if (cents == null || !mounted) return;
    messenger.showSnackBar(
      SnackBar(content: Text('Recorded ${formatCents(cents)} for $label.')),
    );
    await refresh();
  }

  Future<void> decide(AdminJoinRequest request, {required bool approve}) async {
    String? reason;
    if (!approve) {
      final answer = await showDenyDialog(context, request);
      if (answer == null || !mounted) return;
      reason = answer;
    }
    final messenger = ScaffoldMessenger.of(context);
    setState(() => deciding.add(request.id));
    String message;
    var reload = true;
    try {
      if (approve) {
        await widget.admin.approveJoinRequest(request.id);
        message = 'Approved ${request.label}. They can sign in now.';
      } else {
        await widget.admin.denyJoinRequest(request.id, reason: reason);
        message = 'Denied the request from ${request.label}.';
      }
    } on ApiException catch (e) {
      message = switch (e.statusCode) {
        409 when e.error == 'not_pending' =>
          'That request was already decided.',
        409 => e.error ?? 'That change isn’t allowed.',
        404 => 'That request no longer exists.',
        403 => 'Only club admins can do that.',
        401 => 'Your session ended. Sign in again.',
        _ => 'The club server had a problem. Try again in a minute.',
      };
      reload = e.statusCode == 409 || e.statusCode == 404;
    } on Exception {
      message = 'Couldn’t reach the club server. Try again.';
      reload = false;
    }
    if (!mounted) return;
    setState(() => deciding.remove(request.id));
    messenger.showSnackBar(SnackBar(content: Text(message)));
    if (reload) await refresh();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: refresh,
    child: PageList(
      children: [
        const SectionHeading('DUES'),
        FutureBuilder<_DuesBoard>(
          future: dues,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _Loading();
            }
            if (snapshot.hasError) {
              return _LoadError(
                error: snapshot.error,
                what: 'dues',
                notFound: const StatusPanel(
                  message: 'Dues are switched off',
                  detail:
                      'The club server isn’t tracking dues right now, so '
                      'there’s nothing to collect here.',
                ),
                onRetry: refresh,
              );
            }
            final board = snapshot.data!;
            if (board.groups.isEmpty) {
              return const StatusPanel(
                message: 'No dues assigned yet.',
                detail: 'Dues assigned on the website show up here.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final group in board.groups)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: DuesGroupCard(
                      group: group,
                      label: board.label,
                      expanded: expanded.contains(group.key),
                      onToggle: () => setState(() {
                        if (!expanded.remove(group.key)) {
                          expanded.add(group.key);
                        }
                      }),
                      onRecord: (item) => record(
                        item,
                        board.label(item.playerSubject),
                        group.description,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
        const SizedBox(height: 12),
        const SectionHeading('JOIN REQUESTS'),
        FutureBuilder<List<AdminJoinRequest>>(
          future: requests,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const _Loading();
            }
            if (snapshot.hasError) {
              return _LoadError(
                error: snapshot.error,
                what: 'join requests',
                notFound: const StatusPanel(
                  message: 'Join requests aren’t switched on yet.',
                ),
                onRetry: refresh,
              );
            }
            final items = snapshot.data!;
            if (items.isEmpty) {
              return const StatusPanel(
                message: 'No requests waiting.',
                detail: 'New requests to join show up here.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final request in items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: JoinRequestCard(
                      request: request,
                      busy: deciding.contains(request.id),
                      onApprove: () => decide(request, approve: true),
                      onDeny: () => decide(request, approve: false),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    ),
  );
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(24),
    child: Center(child: CircularProgressIndicator()),
  );
}

/// A failed load: [notFound] for a 404 (the feature is off; nothing to
/// retry), otherwise a message with Retry.
class _LoadError extends StatelessWidget {
  const _LoadError({
    required this.error,
    required this.what,
    required this.notFound,
    required this.onRetry,
  });

  final Object? error;
  final String what;
  final Widget notFound;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final error = this.error;
    if (error is ApiException && error.statusCode == 404) return notFound;
    if (error is ApiException && error.statusCode == 403) {
      return StatusPanel(message: 'Only club admins can see $what.');
    }
    return StatusPanel(
      message: 'Couldn’t load $what.',
      detail: 'Check your connection and try again.',
      action: FilledButton(onPressed: onRetry, child: const Text('RETRY')),
    );
  }
}

/// One dues description across the club: progress, money, and (open) who
/// is in each status. Tapping someone who owes money records a payment.
class DuesGroupCard extends StatelessWidget {
  const DuesGroupCard({
    super.key,
    required this.group,
    required this.label,
    required this.expanded,
    required this.onToggle,
    required this.onRecord,
  });

  final DuesGroup group;
  final String Function(String subject) label;
  final bool expanded;
  final VoidCallback onToggle;
  final void Function(DuesAssessment item) onRecord;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final numbers = textTheme.bodySmall?.copyWith(fontFeatures: tabularFigures);
    List<DuesAssessment> sorted(List<DuesAssessment> items) => [...items]
      ..sort(
        (a, b) =>
            label(a.playerSubject)
                .toLowerCase()
                .compareTo(label(b.playerSubject).toLowerCase()),
      );
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: expanded,
            onTapHint: expanded ? 'hide players' : 'show players',
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            group.title,
                            style: textTheme.titleMedium,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ExcludeSemantics(
                          child: Icon(
                            expanded ? Icons.expand_less : Icons.expand_more,
                            color: Brand.secondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    DuesProgressBar(group: group),
                    const SizedBox(height: 10),
                    Text(
                      group.progressLine,
                      style: textTheme.bodyMedium?.copyWith(
                        fontFeatures: tabularFigures,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(group.moneyLine, style: numbers),
                  ],
                ),
              ),
            ),
          ),
          if (expanded) ...[
            const Divider(height: 1),
            for (final (title, items) in [
              ('Unpaid', sorted(group.unpaid)),
              ('Partly paid', sorted(group.partial)),
              ('Paid in full', sorted(group.paid)),
            ])
              if (items.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                  child: Semantics(
                    header: true,
                    child: Eyebrow('$title (${items.length})'),
                  ),
                ),
                for (final item in items)
                  _PlayerDuesRow(
                    dues: item,
                    label: label(item.playerSubject),
                    onRecord: item.balanceCents > 0
                        ? () => onRecord(item)
                        : null,
                  ),
              ],
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

/// Blue for the share paid in full, light pink for partly paid, grey for
/// the rest. The counts are read out by the text beneath it.
class DuesProgressBar extends StatelessWidget {
  const DuesProgressBar({super.key, required this.group});
  final DuesGroup group;

  @override
  Widget build(BuildContext context) {
    final rest = group.count - group.paid.length - group.partial.length;
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(
          height: 8,
          child: Row(
            children: [
              if (group.paid.isNotEmpty)
                Expanded(
                  flex: group.paid.length,
                  child: const ColoredBox(color: Brand.blue),
                ),
              if (group.partial.isNotEmpty)
                Expanded(
                  flex: group.partial.length,
                  child: const ColoredBox(color: Brand.pinkBorder),
                ),
              if (rest > 0)
                Expanded(
                  flex: rest,
                  child: const ColoredBox(color: Brand.divider),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlayerDuesRow extends StatelessWidget {
  const _PlayerDuesRow({
    required this.dues,
    required this.label,
    required this.onRecord,
  });

  final DuesAssessment dues;
  final String label;
  final VoidCallback? onRecord;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final owes = dues.balanceCents > 0;
    final detail = [
      if (dues.paidCents > 0 && owes)
        'Paid ${formatCents(dues.paidCents)} of '
            '${formatCents(dues.amountCents)}',
      if (dues.hasPendingCheckout)
        'Card checkout ${formatCents(dues.pendingCheckoutCents)} in progress',
    ].join(' · ');
    return Semantics(
      button: owes,
      onTapHint: owes ? 'record a payment' : null,
      child: InkWell(
        onTap: onRecord,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: textTheme.bodyLarge),
                      if (detail.isNotEmpty)
                        Text(
                          detail,
                          style: textTheme.bodySmall?.copyWith(
                            fontFeatures: tabularFigures,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (owes) ...[
                  Text(
                    'Owes ${formatCents(dues.balanceCents)}',
                    style: textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: tabularFigures,
                    ),
                  ),
                  const ExcludeSemantics(
                    child: Icon(Icons.chevron_right, color: Brand.secondary),
                  ),
                ] else
                  const FixtureBadge(label: 'PAID'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A pending request to join, with Approve (as a player) and Deny.
class JoinRequestCard extends StatelessWidget {
  const JoinRequestCard({
    super.key,
    required this.request,
    required this.busy,
    required this.onApprove,
    required this.onDeny,
  });

  final AdminJoinRequest request;
  final bool busy;
  final VoidCallback onApprove, onDeny;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final when = request.createdAt;
    final provider = switch (request.provider) {
      'google' => 'GOOGLE',
      'apple' => 'APPLE',
      _ => null,
    };
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(request.label, style: textTheme.titleMedium),
              ),
              if (provider != null) ...[
                const SizedBox(width: 8),
                FixtureBadge(label: provider, accent: true),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(
            [request.email, ?request.phone].join(' · '),
            style: textTheme.bodySmall,
          ),
          if (when != null)
            Text(
              'Requested '
              '${MaterialLocalizations.of(context).formatMediumDate(when.toLocal())}',
              style: textTheme.bodySmall,
            ),
          if (request.message != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.only(left: 10),
              decoration: const BoxDecoration(
                border: Border(left: BorderSide(color: Brand.pink, width: 2)),
              ),
              child: Text(request.message!, style: textTheme.bodyMedium),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton(
                onPressed: busy ? null : onApprove,
                child: Text(
                  busy ? 'SAVING…' : 'APPROVE',
                  semanticsLabel: 'Approve ${request.label} as a player',
                ),
              ),
              TextButton(
                style: destructiveButtonStyle,
                onPressed: busy ? null : onDeny,
                child: Text(
                  'DENY',
                  semanticsLabel: 'Deny the request from ${request.label}',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Confirms a denial. Returns the optional reason ('' for none), or null
/// when the admin backs out.
Future<String?> showDenyDialog(
  BuildContext context,
  AdminJoinRequest request,
) => showDialog<String>(
  context: context,
  builder: (_) => _DenyDialog(request: request),
);

class _DenyDialog extends StatefulWidget {
  const _DenyDialog({required this.request});
  final AdminJoinRequest request;

  @override
  State<_DenyDialog> createState() => _DenyDialogState();
}

class _DenyDialogState extends State<_DenyDialog> {
  final reason = TextEditingController();

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Deny ${widget.request.label}?'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'They won’t be able to sign in. They can ask again later.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('deny-reason'),
          controller: reason,
          maxLength: 500,
          maxLines: 3,
          minLines: 1,
          decoration: const InputDecoration(labelText: 'Reason (optional)'),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('CANCEL'),
      ),
      TextButton(
        key: const Key('confirm-deny'),
        style: destructiveButtonStyle,
        onPressed: () => Navigator.of(context).pop(reason.text.trim()),
        child: const Text('DENY REQUEST'),
      ),
    ],
  );
}
