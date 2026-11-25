import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../data/club_repository.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import 'availability.dart';
import 'fixture_card.dart';

/// The published lineup on a match page (`GET /v1/fixtures/{id}/lineup`).
/// Shows nothing until it's published, or when it can't be loaded.
class MatchLineupSection extends StatefulWidget {
  const MatchLineupSection({
    super.key,
    required this.fixtureId,
    required this.members,
    required this.me,
  });

  final String fixtureId;
  final MemberRepository members;

  /// The signed-in member's subject, highlighted as "You".
  final String? me;

  @override
  State<MatchLineupSection> createState() => _MatchLineupSectionState();
}

class _MatchLineupSectionState extends State<MatchLineupSection> {
  late Future<Lineup> lineup = widget.members.lineup(widget.fixtureId);

  @override
  Widget build(BuildContext context) => FutureBuilder<Lineup>(
    future: lineup,
    builder: (context, snapshot) {
      final data = snapshot.data;
      if (data == null || !data.published || data.slots.isEmpty) {
        return const SizedBox.shrink();
      }
      return Padding(
        padding: const EdgeInsets.only(top: 24),
        child: LineupView(lineup: data, me: widget.me),
      );
    },
  );
}

/// "LINEUP": starters 1–15 with positions, then REPLACEMENTS 16–23.
class LineupView extends StatelessWidget {
  const LineupView({super.key, required this.lineup, this.me});
  final Lineup lineup;
  final String? me;

  @override
  Widget build(BuildContext context) {
    final replacements = lineup.replacements;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeading('LINEUP'),
        Panel(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final slot in lineup.starters)
                _LineupRow(slot: slot, me: slot.subject == me),
              if (replacements.isNotEmpty) ...[
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Eyebrow('REPLACEMENTS'),
                ),
                for (final slot in replacements)
                  _LineupRow(slot: slot, me: slot.subject == me),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _NumberBadge extends StatelessWidget {
  const _NumberBadge(this.number, {this.filled = true});
  final int number;
  final bool filled;

  @override
  Widget build(BuildContext context) => Container(
    width: 30,
    height: 30,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: filled ? Brand.ink : Brand.background,
      border: Border.all(color: filled ? Brand.ink : Brand.divider),
    ),
    child: Text(
      '$number',
      style: TextStyle(
        fontFeatures: tabularFigures,
        fontWeight: FontWeight.w700,
        fontSize: 13,
        color: filled ? Brand.background : Brand.secondary,
      ),
    ),
  );
}

class _LineupRow extends StatelessWidget {
  const _LineupRow({required this.slot, required this.me});
  final LineupSlot slot;
  final bool me;

  @override
  Widget build(BuildContext context) => Container(
    key: me ? const Key('lineup-me') : null,
    color: me ? Brand.pinkTint : null,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
    child: Row(
      children: [
        _NumberBadge(slot.number),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                slot.label,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                slot.number > lineupStarters ? 'Replacement' : slot.position,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        if (me) const FixtureBadge(label: 'YOU', accent: true),
      ],
    ),
  );
}

const _groups = <(AvailabilityStatus?, String)>[
  (AvailabilityStatus.available, 'Available'),
  (AvailabilityStatus.maybe, 'Maybe'),
  (null, 'No reply'),
  (AvailabilityStatus.unavailable, 'Out'),
];

/// Admins on a match page: who said what, the lineup's state, and the
/// lineup editor.
class MatchAdminSection extends StatefulWidget {
  const MatchAdminSection({
    super.key,
    required this.fixture,
    required this.admin,
    required this.onLineupChanged,
    this.canEdit = true,
  });

  final Fixture fixture;
  final AdminRepository admin;
  final VoidCallback onLineupChanged;

  /// Coaches (and the super admin) pick lineups; admins only see them.
  final bool canEdit;

  @override
  State<MatchAdminSection> createState() => _MatchAdminSectionState();
}

class _MatchAdminSectionState extends State<MatchAdminSection> {
  late Future<(AdminAvailability, Lineup)> data = load();

  Future<(AdminAvailability, Lineup)> load() async {
    final id = widget.fixture.id;
    final availability = widget.admin.matchAvailability(id);
    final lineup = widget.admin.lineup(id);
    return (await availability, await lineup);
  }

  Future<void> edit() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            LineupEditorPage(fixture: widget.fixture, admin: widget.admin),
      ),
    );
    if (!mounted) return;
    setState(() {
      data = load();
    });
    widget.onLineupChanged();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const SizedBox(height: 24),
      const SectionHeading('ADMIN'),
      FutureBuilder<(AdminAvailability, Lineup)>(
        future: data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return StatusPanel(
              message: 'Couldn’t load the squad’s answers.',
              action: TextButton(
                onPressed: () => setState(() {
                  data = load();
                }),
                child: const Text('TRY AGAIN'),
              ),
            );
          }
          final loaded = snapshot.data;
          if (loaded == null) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final (availability, lineup) = loaded;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AvailabilityBreakdown(data: availability),
              const SizedBox(height: 12),
              Panel(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Eyebrow('Lineup'),
                          const SizedBox(height: 4),
                          Text(
                            lineup.status == LineupStatus.none
                                ? 'Not started'
                                : '${lineup.status.label} · '
                                      '${lineup.slots.length} of $lineupSize picked',
                            key: const Key('admin-lineup-status'),
                          ),
                        ],
                      ),
                    ),
                    if (widget.canEdit)
                      FilledButton(
                        onPressed: edit,
                        child: const Text('EDIT LINEUP'),
                      )
                    else
                      Text(
                        'The coach picks it',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    ],
  );
}

/// Every member grouped Available / Maybe / No reply / Out, with notes.
class AvailabilityBreakdown extends StatelessWidget {
  const AvailabilityBreakdown({super.key, required this.data});
  final AdminAvailability data;

  @override
  Widget build(BuildContext context) {
    final small = Theme.of(context).textTheme.bodySmall;
    return Panel(
      key: const Key('availability-breakdown'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(data.counts.summary, style: small),
          for (final (status, label) in _groups)
            if (data.withStatus(status) case final members
                when members.isNotEmpty) ...[
              const SizedBox(height: 14),
              Eyebrow('$label · ${members.length}'),
              const SizedBox(height: 4),
              for (final member in members)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(member.label),
                      if (member.note != null)
                        Text('“${member.note}”', style: small),
                    ],
                  ),
                ),
            ],
        ],
      ),
    );
  }
}

/// Builds a match lineup: 23 numbered slots, a member picker (available
/// first), SAVE DRAFT and PUBLISH.
class LineupEditorPage extends StatefulWidget {
  const LineupEditorPage({
    super.key,
    required this.fixture,
    required this.admin,
  });

  final Fixture fixture;
  final AdminRepository admin;

  @override
  State<LineupEditorPage> createState() => _LineupEditorPageState();
}

class _LineupEditorPageState extends State<LineupEditorPage> {
  late Future<void> loading = load();
  Lineup? lineup;
  AdminAvailability? roster;
  final slots = <int, String>{};
  final names = <String, String>{};
  bool saving = false;
  String? error;

  Future<void> load() async {
    final id = widget.fixture.id;
    final availability = widget.admin.matchAvailability(id);
    final saved = widget.admin.lineup(id);
    final (members, current) = (await availability, await saved);
    if (!mounted) return;
    setState(() {
      roster = members;
      for (final member in members.members) {
        names[member.subject] = member.label;
      }
      _take(current);
    });
  }

  void _take(Lineup current) {
    lineup = current;
    slots
      ..clear()
      ..addEntries(current.slots.map((s) => MapEntry(s.number, s.subject)));
    for (final slot in current.slots) {
      names.putIfAbsent(slot.subject, () => slot.label);
    }
  }

  int? numberOf(String subject) =>
      slots.entries.where((e) => e.value == subject).firstOrNull?.key;

  Future<void> pick(int number) async {
    final members = roster?.members ?? const <MemberAvailability>[];
    final subject = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: _MemberPicker(
          number: number,
          members: members,
          current: slots[number],
          numberOf: numberOf,
        ),
      ),
    );
    if (subject == null || !mounted) return;
    setState(() {
      error = null;
      // A player can only fill one slot: picking them again moves them.
      final from = numberOf(subject);
      if (from != null) slots.remove(from);
      slots[number] = subject;
    });
  }

  Future<void> save({required bool publish}) async {
    if (publish) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Publish lineup?'),
          content: const Text('Players in it get a notification.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('CANCEL'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('PUBLISH'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final saved = await widget.admin.saveLineup(
        widget.fixture.id,
        Map.of(slots),
        publish: publish,
      );
      if (!mounted) return;
      setState(() => _take(saved));
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      showMessage(context, publish ? 'Lineup published.' : 'Draft saved.');
    } on ApiException catch (e) {
      if (mounted) {
        setState(
          () => error = e.statusCode == 400 && e.error != null
              ? e.error
              : 'Couldn’t save the lineup (${e.statusCode}). Try again.',
        );
      }
    } on Exception {
      if (mounted) {
        setState(() => error = 'Couldn’t save the lineup. Try again.');
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget slotTile(int number) {
    final subject = slots[number];
    return ListTile(
      key: Key('lineup-slot-$number'),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      leading: _NumberBadge(number, filled: subject != null),
      title: Text(
        subject == null ? 'Empty' : names[subject] ?? 'Club member',
        style: TextStyle(
          fontWeight: subject == null ? FontWeight.w400 : FontWeight.w600,
          color: subject == null ? Brand.secondary : Brand.ink,
        ),
      ),
      subtitle: Text(lineupPosition(number)),
      trailing: subject == null
          ? const Icon(Icons.add)
          : IconButton(
              tooltip: 'Clear #$number',
              icon: const Icon(Icons.close),
              onPressed: saving
                  ? null
                  : () => setState(() => slots.remove(number)),
            ),
      onTap: saving ? null : () => pick(number),
    );
  }

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('EDIT LINEUP')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: FutureBuilder<void>(
            future: loading,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return PageList(
                  children: [
                    StatusPanel(
                      message: 'Couldn’t load the lineup.',
                      action: TextButton(
                        onPressed: () => setState(() {
                          loading = load();
                        }),
                        child: const Text('TRY AGAIN'),
                      ),
                    ),
                  ],
                );
              }
              final current = lineup;
              if (current == null) {
                return const Center(child: CircularProgressIndicator());
              }
              return PageList(
                children: [
                  Eyebrow(
                    '${widget.fixture.title} · '
                    '${localizations.formatMediumDate(widget.fixture.date)}',
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      FixtureBadge(
                        key: const Key('lineup-status'),
                        label: current.status.label.toUpperCase(),
                        accent: current.published,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${slots.length} of $lineupSize picked',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                  if (current.published) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Players can see this lineup. SAVE DRAFT hides it again.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      error!,
                      key: const Key('lineup-error'),
                      style: const TextStyle(color: Brand.danger),
                    ),
                  ],
                  const SizedBox(height: 20),
                  const SectionHeading('STARTERS'),
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var n = 1; n <= lineupStarters; n++) slotTile(n),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  const SectionHeading('REPLACEMENTS'),
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var n = lineupStarters + 1; n <= lineupSize; n++)
                          slotTile(n),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: saving ? null : () => save(publish: false),
                          child: const Text('SAVE DRAFT'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: saving ? null : () => save(publish: true),
                          child: const Text('PUBLISH'),
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Members for one slot: available first, then maybe, no reply, out. A
/// player already in another slot is marked and moves here when picked.
class _MemberPicker extends StatelessWidget {
  const _MemberPicker({
    required this.number,
    required this.members,
    required this.current,
    required this.numberOf,
  });

  final int number;
  final List<MemberAvailability> members;
  final String? current;
  final int? Function(String subject) numberOf;

  @override
  Widget build(BuildContext context) {
    final small = Theme.of(context).textTheme.bodySmall;
    final byGroup = [
      for (final (status, label) in _groups)
        (
          label,
          members.where((m) => m.status == status).toList()..sort(
            (a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()),
          ),
        ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        Text(
          '#$number · ${lineupPosition(number)}'.toUpperCase(),
          style: displayStyle(20),
        ),
        const SizedBox(height: 8),
        if (members.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('No members have signed in yet.'),
          ),
        for (final (label, group) in byGroup)
          if (group.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Eyebrow('$label · ${group.length}'),
            ),
            for (final member in group)
              Builder(
                builder: (context) {
                  final at = numberOf(member.subject);
                  final here = member.subject == current;
                  final details = [
                    if (at != null && !here) 'In #$at · moves here',
                    ?member.note,
                  ];
                  return ListTile(
                    key: Key('pick-${member.subject}'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(member.label),
                    subtitle: details.isEmpty
                        ? null
                        : Text(details.join(' · '), style: small),
                    trailing: here
                        ? const Icon(Icons.check, color: Brand.ink)
                        : member.status == null
                        ? Text('NO REPLY', style: small)
                        : AvailabilityPill(status: member.status!),
                    onTap: () => Navigator.pop(context, member.subject),
                  );
                },
              ),
          ],
      ],
    );
  }
}
