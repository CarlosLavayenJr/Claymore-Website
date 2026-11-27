import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../profile/payment_amount.dart';
import 'admin_people.dart' show membersForAdmin;
import 'dues_summary.dart' show parseDollars;

/// Same default as the website's Assign dues form.
const defaultDuesDescription = 'Season dues';

/// Club Admin → Dues → ASSIGN DUES: to one player or everyone who has signed
/// in, as on the website. Returns a confirmation message once saved.
Future<String?> showAssignDuesSheet(
  BuildContext context, {
  required AdminRepository admin,
  required List<ClubMember> members,
  String Function()? newId,
}) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  backgroundColor: Brand.background,
  builder: (_) =>
      _AssignDuesSheet(admin: admin, members: members, newId: newId ?? uuidV4),
);

/// Club Admin → Dues → AUTOMATIC DUES. Returns a message once saved.
Future<String?> showAutomaticDuesSheet(
  BuildContext context, {
  required AdminRepository admin,
}) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  backgroundColor: Brand.background,
  builder: (_) => _AutomaticDuesSheet(admin: admin),
);

String _failure(Object error, {required String retry}) => switch (error) {
  ApiException(statusCode: 400, :final error) =>
    error ?? 'Check the details and try again.',
  ApiException(statusCode: 409, :final error) =>
    error ?? 'Those dues already exist.',
  ApiException(statusCode: 401) => 'Your session ended. Sign in again.',
  ApiException(statusCode: 403) => 'Only club admins can do that.',
  ApiException(statusCode: 404) =>
    'Dues aren’t switched on in the club server.',
  ApiException() => 'The club server had a problem. $retry',
  _ => 'Couldn’t reach the club server. $retry',
};

class _Sheet extends StatelessWidget {
  const _Sheet({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(title, style: displayStyle(24))),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    ),
  );
}

/// An optional due date: a button that opens the date picker, and Clear.
class _DueDateField extends StatelessWidget {
  const _DueDateField({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final DateTime? value;
  final bool enabled;
  final ValueChanged<DateTime?> onChanged;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            key: const Key('dues-due-date'),
            onPressed: !enabled
                ? null
                : () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: value ?? now,
                      firstDate: DateTime(now.year - 1),
                      lastDate: DateTime(now.year + 3),
                    );
                    if (picked != null) onChanged(picked);
                  },
            icon: const Icon(Icons.event, size: 18),
            label: Text(
              value == null
                  ? 'DUE DATE (OPTIONAL)'
                  : 'DUE ${localizations.formatMediumDate(value!).toUpperCase()}',
            ),
          ),
        ),
        if (value != null)
          IconButton(
            tooltip: 'Clear due date',
            onPressed: enabled ? () => onChanged(null) : null,
            icon: const Icon(Icons.close),
          ),
      ],
    );
  }
}

class _AssignDuesSheet extends StatefulWidget {
  const _AssignDuesSheet({
    required this.admin,
    required this.members,
    required this.newId,
  });

  final AdminRepository admin;
  final List<ClubMember> members;
  final String Function() newId;

  @override
  State<_AssignDuesSheet> createState() => _AssignDuesSheetState();
}

class _AssignDuesSheetState extends State<_AssignDuesSheet> {
  final description = TextEditingController(text: defaultDuesDescription);
  final amount = TextEditingController();
  bool everyone = false;
  bool skipExisting = true;
  String? player;
  DateTime? due;
  bool busy = false;
  String? error;

  /// Kept across retries so a retry after a lost connection creates nothing
  /// twice; a fresh one after a definite answer.
  late String id = widget.newId();

  @override
  void initState() {
    super.initState();
    description.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    description.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final text = description.text.trim();
    final cents = parseDollars(amount.text);
    final problem = !everyone && player == null
        ? 'Pick a player.'
        : text.isEmpty
        ? 'Say what it’s for, like “2026-27 season dues”.'
        : text.length > 120
        ? 'Keep it to 120 characters.'
        : cents == null || cents <= 0
        ? 'Enter an amount, like 125.00.'
        : null;
    if (problem != null) {
      setState(() => error = problem);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final navigator = Navigator.of(context);
    try {
      final result = await widget.admin.assignDues(
        NewDues(
          id: id,
          description: text,
          amountCents: cents!,
          playerSubject: everyone ? null : player,
          dueDate: due,
          skipExisting: skipExisting,
        ),
      );
      final who = everyone
          ? '${result.created} player${result.created == 1 ? '' : 's'}'
                '${result.skipped > 0 ? ' (${result.skipped} already had it)' : ''}'
          : widget.members
                    .where((m) => m.subject == player)
                    .firstOrNull
                    ?.label ??
                'the player';
      navigator.pop('Assigned ${formatCents(cents)} to $who.');
    } on Object catch (e) {
      if (e is ApiException && e.statusCode < 500) id = widget.newId();
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _failure(
          e,
          retry: 'Tap Assign again; it won’t be added twice.',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final players = membersForAdmin(
      widget.members.where((m) => m.role != 'coach'),
    );
    return _Sheet(
      title: 'ASSIGN DUES',
      children: [
        SegmentedButton<bool>(
          key: const Key('assign-who'),
          showSelectedIcon: false,
          segments: [
            const ButtonSegment(value: false, label: Text('ONE PLAYER')),
            ButtonSegment(
              value: true,
              label: Text('EVERYONE (${players.length})'),
            ),
          ],
          selected: {everyone},
          onSelectionChanged: busy
              ? null
              : (v) => setState(() {
                  everyone = v.single;
                  error = null;
                }),
        ),
        const SizedBox(height: 16),
        if (!everyone)
          DropdownButtonFormField<String>(
            key: const Key('assign-player'),
            initialValue: player,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Player'),
            items: [
              for (final m in players)
                DropdownMenuItem(value: m.subject, child: Text(m.label)),
            ],
            onChanged: busy ? null : (v) => setState(() => player = v),
          ),
        if (!everyone) const SizedBox(height: 12),
        TextField(
          key: const Key('assign-description'),
          controller: description,
          enabled: !busy,
          maxLength: 120,
          decoration: const InputDecoration(
            labelText: 'What it’s for',
            helperText: 'Include the season, like “2026-27 season dues”.',
            counterText: '',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('assign-amount'),
          controller: amount,
          enabled: !busy,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Amount',
            prefixText: '\$ ',
          ),
        ),
        const SizedBox(height: 12),
        _DueDateField(
          value: due,
          enabled: !busy,
          onChanged: (v) => setState(() => due = v),
        ),
        if (everyone) ...[
          const SizedBox(height: 8),
          CheckboxListTile(
            key: const Key('assign-skip-existing'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: skipExisting,
            onChanged: busy
                ? null
                : (v) => setState(() => skipExisting = v ?? true),
            title: Text(
              'Skip players who already have “'
              '${description.text.trim().isEmpty ? defaultDuesDescription : description.text.trim()}”',
              style: textTheme.bodyMedium,
            ),
          ),
          Text('Coaches aren’t included.', style: textTheme.bodySmall),
        ],
        if (error != null) ...[
          const SizedBox(height: 10),
          Text(
            error!,
            key: const Key('assign-error'),
            style: textTheme.bodySmall?.copyWith(color: Brand.danger),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          key: const Key('save-assign-dues'),
          onPressed: busy ? null : save,
          child: Text(busy ? 'ASSIGNING…' : 'ASSIGN'),
        ),
      ],
    );
  }
}

class _AutomaticDuesSheet extends StatefulWidget {
  const _AutomaticDuesSheet({required this.admin});
  final AdminRepository admin;

  @override
  State<_AutomaticDuesSheet> createState() => _AutomaticDuesSheetState();
}

class _AutomaticDuesSheetState extends State<_AutomaticDuesSheet> {
  late final Future<AutomaticDues> saved = widget.admin.automaticDues().then((
    s,
  ) {
    if (mounted) {
      setState(() {
        enabled = s.enabled;
        description.text = s.description.isEmpty
            ? defaultDuesDescription
            : s.description;
        amount.text = s.amountCents > 0 ? centsToInput(s.amountCents) : '';
        due = s.dueDate;
      });
    }
    return s;
  });
  final description = TextEditingController(text: defaultDuesDescription);
  final amount = TextEditingController();
  bool enabled = false;
  DateTime? due;
  bool busy = false;
  String? error;

  @override
  void dispose() {
    description.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final text = description.text.trim();
    final cents = parseDollars(amount.text) ?? 0;
    final problem = text.isEmpty
        ? 'Say what it’s for.'
        : enabled && cents <= 0
        ? 'Enter an amount, like 125.00.'
        : null;
    if (problem != null) {
      setState(() => error = problem);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await widget.admin.saveAutomaticDues(
        AutomaticDues(
          enabled: enabled,
          description: text,
          amountCents: cents,
          dueDate: due,
        ),
      );
      navigator.pop(
        enabled
            ? 'Automatic dues on: ${formatCents(cents)} for new players.'
            : 'Automatic dues off.',
      );
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        busy = false;
        error = _failure(e, retry: 'Try again in a minute.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return FutureBuilder<AutomaticDues>(
      future: saved,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _Sheet(
            title: 'AUTOMATIC DUES',
            children: [
              Text(
                _failure(snapshot.error!, retry: 'Close this and try again.'),
              ),
            ],
          );
        }
        if (!snapshot.hasData) {
          return const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _Sheet(
          title: 'AUTOMATIC DUES',
          children: [
            Text(
              'Every player who signs in gets these dues unless you remove '
              'them. Admins and coaches aren’t included. To give them to '
              'players who already signed in, use Assign dues → Everyone.',
              style: textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              key: const Key('automatic-enabled'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Assign automatically'),
              value: enabled,
              onChanged: busy ? null : (v) => setState(() => enabled = v),
            ),
            TextField(
              key: const Key('automatic-description'),
              controller: description,
              enabled: !busy,
              maxLength: 120,
              decoration: const InputDecoration(
                labelText: 'What it’s for',
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('automatic-amount'),
              controller: amount,
              enabled: !busy,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Amount',
                prefixText: '\$ ',
              ),
            ),
            const SizedBox(height: 12),
            _DueDateField(
              value: due,
              enabled: !busy,
              onChanged: (v) => setState(() => due = v),
            ),
            if (error != null) ...[
              const SizedBox(height: 10),
              Text(
                error!,
                key: const Key('automatic-error'),
                style: textTheme.bodySmall?.copyWith(color: Brand.danger),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('save-automatic-dues'),
              onPressed: busy ? null : save,
              child: Text(busy ? 'SAVING…' : 'SAVE'),
            ),
          ],
        );
      },
    );
  }
}
