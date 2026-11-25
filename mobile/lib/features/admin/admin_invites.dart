import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';
import '../fixtures/fixture_card.dart' show FixtureBadge;

/// Club Admin → People: the invite link (share it, copy it, turn it off),
/// invite by email, and everyone invited. Same as the website's "Invite
/// people" section.
class InvitePanel extends StatefulWidget {
  const InvitePanel({
    super.key,
    required this.admin,
    required this.canSetRoles,
    this.selfEmail,
    this.onChanged,
  });

  final AdminRepository admin;

  /// The super admin: invites as coach or admin and removes staff.
  final bool canSetRoles;
  final String? selfEmail;

  /// After an invite or removal, so the rest of the page can reload.
  final VoidCallback? onChanged;

  @override
  State<InvitePanel> createState() => _InvitePanelState();
}

class _InvitePanelState extends State<InvitePanel> {
  late Future<List<InviteLink>> links = widget.admin.inviteLinks();
  late Future<List<ClubInvitation>> invited = widget.admin.invitations();
  final email = TextEditingController();
  String role = 'player';
  int days = 30;
  bool busy = false;
  String? emailError;

  @override
  void dispose() {
    email.dispose();
    super.dispose();
  }

  void reload() => setState(() {
    links = widget.admin.inviteLinks();
    invited = widget.admin.invitations();
  });

  /// Runs [action], shows [done] or the API's problem, and reloads.
  Future<bool> run(Future<void> Function() action, String done) async {
    if (busy) return false;
    setState(() => busy = true);
    String message;
    var ok = false;
    try {
      await action();
      message = done;
      ok = true;
    } on ApiException catch (e) {
      message = switch (e.statusCode) {
        403 => 'Only the super admin can do that for coaches and admins.',
        409 => e.error ?? 'That change isn’t allowed.',
        400 => e.error ?? 'Check the email and try again.',
        401 => 'Your session ended. Sign in again.',
        _ => 'The club server had a problem. Try again in a minute.',
      };
    } on Exception {
      message = 'Couldn’t reach the club server. Try again.';
    }
    if (!mounted) return ok;
    setState(() => busy = false);
    showMessage(context, message);
    if (ok) {
      reload();
      widget.onChanged?.call();
    }
    return ok;
  }

  Future<void> share(InviteLink link, Rect? origin) async {
    await SharePlus.instance.share(
      ShareParams(
        text:
            'Join the Central Florida Claymores on the club app and website: '
            '${link.url}',
        subject: 'Join the Claymores',
        sharePositionOrigin: origin,
      ),
    );
  }

  Future<void> copy(InviteLink link) async {
    var copied = true;
    try {
      await Clipboard.setData(ClipboardData(text: link.url.toString()));
    } on Exception {
      copied = false;
    }
    if (mounted) {
      showMessage(
        context,
        copied ? 'Invite link copied.' : 'Couldn’t copy. Use SHARE instead.',
      );
    }
  }

  Future<void> turnOff(InviteLink link) async {
    final yes = await confirm(
      context,
      title: 'Turn this link off?',
      body: 'People who already joined keep their access.',
      action: 'TURN OFF',
    );
    if (!yes || !mounted) return;
    await run(() => widget.admin.revokeInviteLink(link.id), 'Link turned off.');
  }

  Future<void> sendInvite() async {
    final value = email.text.trim().toLowerCase();
    final valid = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
    setState(() => emailError = valid ? null : 'Enter a Google email.');
    if (!valid) return;
    final ok = await run(
      () => widget.admin.invite(value, role: role),
      role == 'player'
          ? 'Invited $value. They can sign in now.'
          : 'Invited $value as ${role == 'coach' ? 'a coach' : 'an admin'}.',
    );
    if (ok && mounted) {
      email.clear();
      setState(() => role = 'player');
    }
  }

  Future<void> remove(ClubInvitation invitation) async {
    final yes = await confirm(
      context,
      title: 'Remove ${invitation.email}?',
      body: 'They lose access within 30 seconds.',
      action: 'REMOVE',
    );
    if (!yes || !mounted) return;
    await run(
      () => widget.admin.removeInvitation(invitation.email),
      'Removed ${invitation.email}.',
    );
  }

  bool canRemove(ClubInvitation invitation) =>
      invitation.email.toLowerCase() != widget.selfEmail?.toLowerCase() &&
      invitation.role != 'superadmin' &&
      (widget.canSetRoles || !invitation.isStaff);

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeading('INVITE PEOPLE'),
        FutureBuilder<List<InviteLink>>(
          future: links,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Panel(child: LinearProgressIndicator());
            }
            if (snapshot.hasError) {
              return StatusPanel(
                message: 'The invite link couldn’t load.',
                action: TextButton(
                  onPressed: reload,
                  child: const Text('RETRY'),
                ),
              );
            }
            final active = snapshot.data!.where((l) => l.active).toList();
            return _LinkCard(
              link: active.isEmpty ? null : active.first,
              days: days,
              busy: busy,
              onDays: (value) => setState(() => days = value),
              onCreate: () => run(
                () => widget.admin.createInviteLink(days),
                'Invite link ready. Share it with the team.',
              ),
              onShare: share,
              onCopy: copy,
              onTurnOff: turnOff,
            );
          },
        ),
        const SizedBox(height: 12),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Invite by email', style: textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                widget.canSetRoles
                    ? 'For one person, as a player, coach or admin.'
                    : 'For one person. They join as a player.',
                style: textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('invite-email'),
                controller: email,
                enabled: !busy,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                textInputAction: TextInputAction.send,
                decoration: InputDecoration(
                  labelText: 'Google email',
                  errorText: emailError,
                ),
                onSubmitted: (_) => sendInvite(),
              ),
              if (widget.canSetRoles) ...[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final (value, label) in [
                      ('player', 'Player'),
                      ('coach', 'Coach'),
                      ('admin', 'Admin'),
                    ])
                      ChoiceChip(
                        key: Key('invite-role-$value'),
                        label: Text(label),
                        selected: role == value,
                        onSelected: busy
                            ? null
                            : (_) => setState(() => role = value),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton(
                  key: const Key('send-invite'),
                  onPressed: busy ? null : sendInvite,
                  child: Text(busy ? 'SAVING…' : 'INVITE'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FutureBuilder<List<ClubInvitation>>(
          future: invited,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SizedBox.shrink();
            }
            final list = snapshot.data;
            if (snapshot.hasError || list == null) {
              return StatusPanel(
                message: 'The invited list couldn’t load.',
                action: TextButton(
                  onPressed: reload,
                  child: const Text('RETRY'),
                ),
              );
            }
            if (list.isEmpty) return const SizedBox.shrink();
            return _InvitedList(
              invitations: list,
              canRemove: canRemove,
              onRemove: busy ? null : remove,
            );
          },
        ),
      ],
    );
  }
}

class _LinkCard extends StatelessWidget {
  const _LinkCard({
    required this.link,
    required this.days,
    required this.busy,
    required this.onDays,
    required this.onCreate,
    required this.onShare,
    required this.onCopy,
    required this.onTurnOff,
  });

  final InviteLink? link;
  final int days;
  final bool busy;
  final ValueChanged<int> onDays;
  final VoidCallback onCreate;
  final Future<void> Function(InviteLink link, Rect? origin) onShare;
  final ValueChanged<InviteLink> onCopy;
  final ValueChanged<InviteLink> onTurnOff;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    final link = this.link;
    return Panel(
      featured: link != null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Invite link', style: textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Anyone who opens it and signs in with Google joins as a player, '
            'no approval needed.',
            style: textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (link != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Brand.muted,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Brand.divider),
              ),
              child: SelectableText(
                link.url.toString(),
                key: const Key('invite-link-url'),
                style: textTheme.bodySmall?.copyWith(color: Brand.ink),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${link.uses} joined · works until '
              '${localizations.formatMediumDate(link.expiresAt)}',
              style: textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Builder(
                    builder: (buttonContext) => FilledButton.icon(
                      key: const Key('share-invite-link'),
                      onPressed: busy
                          ? null
                          : () {
                              final box =
                                  buttonContext.findRenderObject()
                                      as RenderBox?;
                              onShare(
                                link,
                                box == null
                                    ? null
                                    : box.localToGlobal(Offset.zero) & box.size,
                              );
                            },
                      icon: const Icon(Icons.ios_share, size: 18),
                      label: const Text('SHARE'),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('copy-invite-link'),
                    onPressed: busy ? null : () => onCopy(link),
                    icon: const Icon(Icons.copy, size: 18),
                    label: const Text('COPY'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const Key('turn-off-invite-link'),
                style: TextButton.styleFrom(foregroundColor: Brand.danger),
                onPressed: busy ? null : () => onTurnOff(link),
                child: const Text('TURN OFF LINK'),
              ),
            ),
          ] else ...[
            Text('Link works for', style: textTheme.labelMedium),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final value in const [7, 30, 90])
                  ChoiceChip(
                    key: Key('invite-days-$value'),
                    label: Text('$value days'),
                    selected: days == value,
                    onSelected: busy ? null : (_) => onDays(value),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton(
                key: const Key('make-invite-link'),
                onPressed: busy ? null : onCreate,
                child: Text(busy ? 'SAVING…' : 'MAKE INVITE LINK'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InvitedList extends StatelessWidget {
  const _InvitedList({
    required this.invitations,
    required this.canRemove,
    required this.onRemove,
  });

  final List<ClubInvitation> invitations;
  final bool Function(ClubInvitation invitation) canRemove;
  final ValueChanged<ClubInvitation>? onRemove;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Text(
              'Invited (${invitations.length})',
              style: textTheme.titleMedium,
            ),
          ),
          for (final (i, invitation) in invitations.indexed) ...[
            if (i > 0) const Divider(height: 1),
            Padding(
              key: ValueKey('invited-${invitation.email}'),
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(invitation.email, style: textTheme.bodyLarge),
                        if (invitation.invitedAt != null)
                          Text(
                            'Invited '
                            '${localizations.formatMediumDate(invitation.invitedAt!)}',
                            style: textTheme.bodySmall,
                          ),
                      ],
                    ),
                  ),
                  FixtureBadge(
                    label: invitation.roleBadge,
                    accent: invitation.isStaff,
                  ),
                  if (canRemove(invitation))
                    IconButton(
                      key: Key('remove-${invitation.email}'),
                      tooltip: 'Remove ${invitation.email}',
                      onPressed: onRemove == null
                          ? null
                          : () => onRemove!(invitation),
                      icon: const Icon(Icons.close, color: Brand.secondary),
                    )
                  else
                    const SizedBox(width: 48),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// A yes/no dialog with a red action button.
Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String body,
  required String action,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            key: const Key('confirm-action'),
            style: TextButton.styleFrom(foregroundColor: Brand.danger),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(action),
          ),
        ],
      ),
    ) ??
    false;
