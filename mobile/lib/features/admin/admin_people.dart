import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';
import '../fixtures/fixture_card.dart' show FixtureBadge;

/// Invite links and invitations by email stay on the website.
final websiteInviteUrl = Uri.parse(
  'https://www.claymoresrfc.com/account/admin?tab=people',
);

/// Members missing a last name first (they need fixing), then everyone else,
/// each by name.
List<ClubMember> membersForAdmin(Iterable<ClubMember> members) =>
    [...members]..sort((a, b) {
      final ma = needsFullMemberName(a.name), mb = needsFullMemberName(b.name);
      if (ma != mb) return ma ? -1 : 1;
      return a.label.toLowerCase().compareTo(b.label.toLowerCase());
    });

/// How many members have no last name (empty, one word, or an email).
int missingLastNames(Iterable<ClubMember> members) =>
    members.where((m) => needsFullMemberName(m.name)).length;

/// A pending request to join: Approve (as a player) and Deny, and under
/// "More options" approve as an admin or deny with a reason.
class JoinRequestCard extends StatefulWidget {
  const JoinRequestCard({
    super.key,
    required this.request,
    required this.busy,
    required this.onApprove,
    required this.onDeny,
    this.canSetRoles = false,
  });

  final AdminJoinRequest request;
  final bool busy;

  /// Called with `player`, `coach` or `admin`.
  final void Function(String role) onApprove;

  /// Only the super admin can approve someone as a coach or admin.
  final bool canSetRoles;

  /// Called with the reason typed under More options ('' for none).
  final void Function(String reason) onDeny;

  @override
  State<JoinRequestCard> createState() => _JoinRequestCardState();
}

class _JoinRequestCardState extends State<JoinRequestCard> {
  bool more = false;
  String role = 'player';
  final reason = TextEditingController();

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final request = widget.request;
    final busy = widget.busy;
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
                key: Key('approve-${request.id}'),
                onPressed: busy ? null : () => widget.onApprove('player'),
                child: Text(
                  busy ? 'SAVING…' : 'APPROVE',
                  semanticsLabel: 'Approve ${request.label} as a player',
                ),
              ),
              TextButton(
                key: Key('deny-${request.id}'),
                style: destructiveButtonStyle,
                onPressed: busy ? null : () => widget.onDeny(''),
                child: Text(
                  'DENY',
                  semanticsLabel: 'Deny the request from ${request.label}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          TextButton.icon(
            key: Key('more-options-${request.id}'),
            style: TextButton.styleFrom(
              foregroundColor: Brand.ink,
              padding: EdgeInsets.zero,
            ),
            onPressed: () => setState(() => more = !more),
            icon: Icon(more ? Icons.expand_less : Icons.expand_more),
            label: const Text('More options'),
          ),
          if (more)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Brand.muted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.canSetRoles) ...[
                    Text('Approve as', style: textTheme.labelMedium),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final (value, label) in [
                          ('player', 'Player'),
                          ('coach', 'Coach'),
                          ('admin', 'Admin'),
                        ])
                          ChoiceChip(
                            key: Key('role-$value-${request.id}'),
                            label: Text(label),
                            selected: role == value,
                            onSelected: busy
                                ? null
                                : (_) => setState(() => role = value),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      key: Key('approve-as-${request.id}'),
                      onPressed: busy ? null : () => widget.onApprove(role),
                      child: Text('APPROVE AS ${role.toUpperCase()}'),
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextField(
                    key: Key('deny-reason-${request.id}'),
                    controller: reason,
                    enabled: !busy,
                    maxLength: 500,
                    maxLines: 3,
                    minLines: 1,
                    decoration: const InputDecoration(
                      labelText: 'Deny with a reason (optional)',
                    ),
                  ),
                  TextButton(
                    key: Key('deny-with-reason-${request.id}'),
                    style: destructiveButtonStyle,
                    onPressed: busy
                        ? null
                        : () => widget.onDeny(reason.text.trim()),
                    child: const Text('DENY WITH REASON'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Confirms a denial, prefilled with [reason]. Returns the optional reason
/// ('' for none), or null when the admin backs out.
Future<String?> showDenyDialog(
  BuildContext context,
  AdminJoinRequest request, {
  String reason = '',
}) => showDialog<String>(
  context: context,
  builder: (_) => _DenyDialog(request: request, reason: reason),
);

class _DenyDialog extends StatefulWidget {
  const _DenyDialog({required this.request, required this.reason});
  final AdminJoinRequest request;
  final String reason;

  @override
  State<_DenyDialog> createState() => _DenyDialogState();
}

class _DenyDialogState extends State<_DenyDialog> {
  late final reason = TextEditingController(text: widget.reason);

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

/// Confirms approving [request] as an admin. True to go ahead.
Future<bool> confirmApproveAdmin(
  BuildContext context,
  AdminJoinRequest request, {
  String role = 'admin',
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Make ${request.label} ${role == 'coach' ? 'a coach' : 'an admin'}?',
        ),
        content: Text(
          role == 'coach'
              ? 'Coaches can approve members, record dues and pick lineups. '
                    'They aren’t asked whether they can play.'
              : 'Admins can approve members, record dues and see lineups.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            key: const Key('confirm-admin'),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('APPROVE AS ${role.toUpperCase()}'),
          ),
        ],
      ),
    ) ??
    false;

/// Everyone who has signed in, missing last names first. Tapping a member
/// edits their name (and, for the super admin, their role).
class AdminMembersList extends StatelessWidget {
  const AdminMembersList({
    super.key,
    required this.members,
    required this.onEdit,
  });

  final List<ClubMember> members;
  final void Function(ClubMember member) onEdit;

  @override
  Widget build(BuildContext context) {
    if (members.isEmpty) {
      return const StatusPanel(
        message: 'No members yet.',
        detail: 'People show up here after they first sign in.',
      );
    }
    final sorted = membersForAdmin(members);
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, member) in sorted.indexed) ...[
            if (i > 0) const Divider(height: 1),
            _MemberRow(
              key: ValueKey('member-${member.subject}'),
              member: member,
              onTap: () => onEdit(member),
            ),
          ],
        ],
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({super.key, required this.member, required this.onTap});
  final ClubMember member;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final missing = needsFullMemberName(member.name);
    final hasEmailLine = member.name != null && member.email.isNotEmpty;
    return Semantics(
      button: true,
      onTapHint: 'edit name',
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(member.label, style: textTheme.bodyLarge),
                      if (hasEmailLine)
                        Text(member.email, style: textTheme.bodySmall),
                    ],
                  ),
                ),
                if (member.staffLabel case final label?) ...[
                  const SizedBox(width: 8),
                  FixtureBadge(label: label),
                ],
                if (missing) ...[
                  const SizedBox(width: 8),
                  const FixtureBadge(label: 'NO LAST NAME', accent: true),
                ],
                const ExcludeSemantics(
                  child: Icon(Icons.chevron_right, color: Brand.secondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// What the edit-name sheet ended with.
enum MemberNameResult { saved, roleSaved, gone }

/// Edits [member]'s name with `PUT /v1/admin/members/{subject}/name`.
/// Returns [MemberNameResult.saved], [MemberNameResult.gone] (404), or null
/// when the admin closes it.
///
/// With [canSetRole] (the super admin, on someone else), it also changes
/// their role with `PUT /v1/admin/invitations/{email}`.
Future<MemberNameResult?> showEditMemberName(
  BuildContext context, {
  required AdminRepository admin,
  required ClubMember member,
  bool canSetRole = false,
}) => showModalBottomSheet<MemberNameResult>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  backgroundColor: Brand.background,
  builder: (_) => _EditMemberNameSheet(
    admin: admin,
    member: member,
    canSetRole:
        canSetRole && member.role != 'superadmin' && member.email.isNotEmpty,
  ),
);

class _EditMemberNameSheet extends StatefulWidget {
  const _EditMemberNameSheet({
    required this.admin,
    required this.member,
    required this.canSetRole,
  });
  final AdminRepository admin;
  final ClubMember member;
  final bool canSetRole;

  @override
  State<_EditMemberNameSheet> createState() => _EditMemberNameSheetState();
}

class _EditMemberNameSheetState extends State<_EditMemberNameSheet> {
  late final TextEditingController first, last;
  String? firstError, lastError, error, roleError;
  bool busy = false;
  late String role = widget.member.role ?? 'player';

  Future<void> saveRole() async {
    if (busy) return;
    final navigator = Navigator.of(context);
    setState(() => busy = true);
    String? problem;
    try {
      await widget.admin.setMemberRole(widget.member.email, role);
      navigator.pop(MemberNameResult.roleSaved);
      return;
    } on ApiException catch (e) {
      problem = switch (e.statusCode) {
        403 => 'Only the super admin can change roles.',
        409 => e.error ?? 'That role can’t be changed.',
        401 => 'Your session ended. Sign in again.',
        _ => 'The club server had a problem. Try again in a minute.',
      };
    } on Exception {
      problem = 'Couldn’t reach the club server. Try again.';
    }
    if (!mounted) return;
    setState(() {
      busy = false;
      roleError = problem;
    });
  }

  @override
  void initState() {
    super.initState();
    final parts = splitMemberName(widget.member.name);
    first = TextEditingController(text: parts.first);
    last = TextEditingController(text: parts.last);
  }

  @override
  void dispose() {
    first.dispose();
    last.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy) return;
    final missingFirst = first.text.trim().isEmpty;
    final missingLast = last.text.trim().isEmpty;
    final joined = joinMemberName(first.text, last.text);
    setState(() {
      firstError = missingFirst ? 'Enter a first name.' : null;
      lastError = missingLast ? 'Enter a last name.' : null;
      error = missingFirst || missingLast ? null : joined.error;
    });
    final name = joined.name;
    if (name == null) return;
    final navigator = Navigator.of(context);
    setState(() => busy = true);
    String? problem;
    try {
      await widget.admin.setMemberName(widget.member.subject, name);
      navigator.pop(MemberNameResult.saved);
      return;
    } on ApiException catch (e) {
      if (e.statusCode == 404) {
        navigator.pop(MemberNameResult.gone);
        return;
      }
      problem = switch (e.statusCode) {
        400 => e.error ?? 'Enter both a first and a last name.',
        403 => 'Only club admins can do that.',
        401 => 'Your session ended. Sign in again.',
        _ => 'The club server had a problem. Try again in a minute.',
      };
    } on Exception {
      problem = 'Couldn’t reach the club server. Try again.';
    }
    if (!mounted) return;
    setState(() {
      busy = false;
      error = problem;
    });
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final member = widget.member;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            BrandHeader(
              eyebrow: 'Club admin',
              title: widget.canSetRole ? 'Edit member' : 'Edit name',
              titleSize: 22,
              body: member.email.isEmpty
                  ? 'As the club shows it on lineups and dues.'
                  : '${member.email}. As the club shows it on lineups and '
                        'dues.',
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('member-first-name'),
              controller: first,
              enabled: !busy,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              maxLength: maxMemberNameLength,
              buildCounter: _noCounter,
              decoration: InputDecoration(
                labelText: 'First name',
                errorText: firstError,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('member-last-name'),
              controller: last,
              enabled: !busy,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.done,
              maxLength: maxMemberNameLength,
              buildCounter: _noCounter,
              decoration: InputDecoration(
                labelText: 'Last name',
                errorText: lastError,
              ),
              onSubmitted: (_) => save(),
            ),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(
                error!,
                key: const Key('member-name-error'),
                style: textTheme.bodySmall?.copyWith(color: Brand.danger),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                FilledButton(
                  key: const Key('save-member-name'),
                  onPressed: busy ? null : save,
                  child: Text(busy ? 'SAVING…' : 'SAVE'),
                ),
                const SizedBox(width: 12),
                TextButton(
                  onPressed: busy ? null : () => Navigator.of(context).pop(),
                  child: const Text('CANCEL'),
                ),
              ],
            ),
            if (widget.canSetRole) ...[
              const SizedBox(height: 24),
              const Divider(height: 1),
              const SizedBox(height: 16),
              Text('Role', style: textTheme.labelMedium),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  for (final (value, label) in [
                    ('player', 'Player'),
                    ('coach', 'Coach'),
                    ('admin', 'Admin'),
                  ])
                    ChoiceChip(
                      key: Key('member-role-$value'),
                      label: Text(label),
                      selected: role == value,
                      onSelected: busy
                          ? null
                          : (_) => setState(() => role = value),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(switch (role) {
                'coach' =>
                  'Coaches run the club and pick lineups. They aren’t asked '
                      'whether they can play.',
                'admin' =>
                  'Admins run the club (dues, members, matches) but don’t '
                      'pick lineups.',
                _ => 'Players answer availability and get club dues.',
              }, style: textTheme.bodySmall),
              if (roleError != null) ...[
                const SizedBox(height: 8),
                Text(
                  roleError!,
                  key: const Key('member-role-error'),
                  style: textTheme.bodySmall?.copyWith(color: Brand.danger),
                ),
              ],
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  key: const Key('save-member-role'),
                  onPressed: busy || role == (widget.member.role ?? 'player')
                      ? null
                      : saveRole,
                  child: const Text('SAVE ROLE'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static Widget? _noCounter(
    BuildContext context, {
    required int currentLength,
    required bool isFocused,
    required int? maxLength,
  }) => null;
}

/// Invite links and invitations by email are on the website only.
class InviteOnWebsite extends StatelessWidget {
  const InviteOnWebsite({super.key});

  Future<void> open(BuildContext context) async {
    try {
      if (await launchUrl(
        websiteInviteUrl,
        mode: LaunchMode.externalApplication,
      )) {
        return;
      }
    } on Exception {
      // Same message as a missing browser.
    }
    if (context.mounted) showMessage(context, 'Couldn’t open the website.');
  }

  @override
  Widget build(BuildContext context) => Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Invite people on the website',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Invite links for the group chat and invitations by email are on '
          'the website’s Club Admin page.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          key: const Key('invite-on-website'),
          onPressed: () => open(context),
          child: const Text('OPEN WEBSITE'),
        ),
      ],
    ),
  );
}
