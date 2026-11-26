import 'dart:async';

import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/club_repository.dart';
import '../../data/club_time.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../auth/auth_service.dart';

/// The signed-in member's answers for upcoming matches
/// (`GET /v1/availability/mine`), for the chips on fixture cards. Loaded on
/// sign-in, refreshed on resume, cleared on sign-out, and updated right away
/// when the member answers on a match page.
class AvailabilityStore extends ChangeNotifier {
  AvailabilityStore({
    required this._auth,
    required this._members,
    this.enabled = true,
  }) {
    _auth.addListener(_authChanged);
    _authChanged();
  }

  final AuthService _auth;
  final MemberRepository? _members;

  /// Off in builds without availability ([AvailabilityGate]).
  final bool enabled;

  String? _subject;
  Map<String, AvailabilityAnswer>? _mine;
  int _generation = 0;
  bool _disposed = false;

  /// Whether the member's answers have been loaded at least once.
  bool get loaded => _mine != null;

  /// The member's answer for [fixtureId]; null when unanswered (or not
  /// loaded: check [loaded]).
  AvailabilityAnswer? answerFor(String fixtureId) {
    final answer = _mine?[fixtureId];
    return answer?.status == null ? null : answer;
  }

  void _authChanged() {
    final subject = enabled && _members != null && _auth.signedIn
        ? _auth.user?.subject
        : null;
    if (subject == _subject) return;
    _subject = subject;
    _generation++;
    final hadAnswers = _mine != null;
    _mine = null;
    if (hadAnswers) _notify();
    if (subject != null) unawaited(refresh());
  }

  /// Reloads the member's answers. Failures keep what was loaded before.
  Future<void> refresh() async {
    final members = _members;
    if (members == null || _subject == null) return;
    final generation = _generation;
    try {
      final answers = await members.myAvailability();
      if (generation != _generation || _disposed) return;
      _mine = {for (final answer in answers) answer.fixtureId: answer};
      _notify();
    } on Object catch (error) {
      debugPrint('Couldn’t load availability: $error');
    }
  }

  /// Records an answer made on this device (optimistically, or once saved).
  void put(AvailabilityAnswer answer) {
    if (_subject == null) return;
    (_mine ??= {})[answer.fixtureId] = answer;
    _notify();
  }

  /// Puts back [previous] (null: no answer) after a failed save.
  void restore(String fixtureId, AvailabilityAnswer? previous) {
    if (_subject == null) return;
    final mine = _mine ??= {};
    if (previous == null) {
      mine.remove(fixtureId);
    } else {
      mine[fixtureId] = previous;
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _auth.removeListener(_authChanged);
    super.dispose();
  }
}

/// Upcoming Claymores matches take answers, club events (the Highland
/// Games) too since the club plays there; past matches don't.
bool takesAvailability(Fixture fixture) =>
    fixture.status == 'upcoming' && !fixture.date.isBefore(clubToday());

Color _tint(AvailabilityStatus status) => switch (status) {
  AvailabilityStatus.available => Brand.blueTint,
  AvailabilityStatus.maybe => Brand.pinkTint,
  AvailabilityStatus.unavailable => Brand.muted,
};

Color _border(AvailabilityStatus status) => switch (status) {
  AvailabilityStatus.available => Brand.blueBorder,
  AvailabilityStatus.maybe => Brand.pinkBorder,
  AvailabilityStatus.unavailable => Brand.divider,
};

IconData _icon(AvailabilityStatus status) => switch (status) {
  AvailabilityStatus.available => Icons.check_circle_outline,
  AvailabilityStatus.maybe => Icons.help_outline,
  AvailabilityStatus.unavailable => Icons.cancel_outlined,
};

/// Small pill with an answer: "YOU: AVAILABLE".
class AvailabilityPill extends StatelessWidget {
  const AvailabilityPill({super.key, required this.status, this.prefix});
  final AvailabilityStatus status;
  final String? prefix;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: _tint(status),
      border: Border.all(color: _border(status)),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(_icon(status), size: 13, color: Brand.ink),
        const SizedBox(width: 4),
        Text(
          prefix == null ? status.button : '$prefix: ${status.button}',
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: Brand.ink,
          ),
        ),
      ],
    ),
  );
}

/// The member's answer on a fixture card; with [prompt], an unanswered
/// match asks them to answer.
class AvailabilityCardFooter extends StatelessWidget {
  const AvailabilityCardFooter({
    super.key,
    required this.fixture,
    required this.onAnswer,
    this.prompt = false,
  });

  final Fixture fixture;
  final bool prompt;
  final VoidCallback onAnswer;

  @override
  Widget build(BuildContext context) {
    final store = AppScope.of(context).availability;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final answer = store.answerFor(fixture.id);
        if (answer != null) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: AvailabilityPill(
                key: const Key('availability-chip'),
                status: answer.status!,
                prefix: 'YOU',
              ),
            ),
          );
        }
        if (!prompt || !store.loaded) return const SizedBox.shrink();
        return Container(
          key: const Key('availability-prompt'),
          decoration: const BoxDecoration(
            color: Brand.pinkTint,
            border: Border(top: BorderSide(color: Brand.divider)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Can you play? Let the coaches know.',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
              TextButton(onPressed: onAnswer, child: const Text('ANSWER')),
            ],
          ),
        );
      },
    );
  }
}

/// "CAN YOU PLAY?" on an upcoming match page: AVAILABLE / MAYBE / OUT, an
/// optional note, and the club's counts. Saves optimistically and rolls back
/// with a message when the API refuses. Read-only once answers close.
class MatchAvailabilityPanel extends StatefulWidget {
  const MatchAvailabilityPanel({
    super.key,
    required this.fixtureId,
    required this.members,
    this.embedded = false,
  });

  final String fixtureId;
  final MemberRepository members;

  /// Inside another card (the Club tab's match rows): no heading, no panel.
  final bool embedded;

  @override
  State<MatchAvailabilityPanel> createState() => _MatchAvailabilityPanelState();
}

class _MatchAvailabilityPanelState extends State<MatchAvailabilityPanel> {
  MyAvailability? data;
  Object? error;
  bool saving = false;
  final note = TextEditingController();

  @override
  void initState() {
    super.initState();
    note.addListener(_noteChanged);
    unawaited(load());
  }

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  void _noteChanged() => setState(() {});

  Future<void> load() async {
    setState(() {
      error = null;
      data = null;
    });
    try {
      final loaded = await widget.members.availability(widget.fixtureId);
      if (!mounted) return;
      setState(() => data = loaded);
      note.text = loaded.note ?? '';
      if (loaded.status != null) {
        AppScope.of(context).availability.put(loaded.answer);
      }
    } on Object catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> save(AvailabilityStatus status) async {
    final previous = data;
    if (previous == null || saving) return;
    final store = AppScope.of(context).availability;
    final previousAnswer = store.answerFor(widget.fixtureId);
    final text = note.text.trim();
    final optimistic = previous.answered(status, text.isEmpty ? null : text);
    setState(() {
      data = optimistic;
      saving = true;
    });
    store.put(optimistic.answer);
    try {
      final saved = await widget.members.answerAvailability(
        widget.fixtureId,
        status,
        note: text,
      );
      if (!mounted) return;
      setState(() => data = saved);
      store.put(saved.answer);
    } on Object catch (e) {
      final closed = e is ApiException && e.statusCode == 409;
      store.restore(widget.fixtureId, previousAnswer);
      if (!mounted) return;
      setState(() => data = closed ? previous.closed() : previous);
      showMessage(
        context,
        e is ApiException && e.error != null && e.statusCode < 500
            ? e.error!
            : 'Could not save your answer. Try again.',
      );
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = this.data;
    final textTheme = Theme.of(context).textTheme;
    final Widget body;
    if (error != null) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            error is ApiException && (error as ApiException).statusCode == 404
                ? 'This match isn’t taking answers.'
                : 'Couldn’t load your availability.',
          ),
          TextButton(onPressed: load, child: const Text('TRY AGAIN')),
        ],
      );
    } else if (data == null) {
      body = const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: CircularProgressIndicator()),
      );
    } else {
      final savedNote = data.note ?? '';
      final noteChanged = note.text.trim() != savedNote;
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (data.open) ...[
            SegmentedButton<AvailabilityStatus>(
              key: const Key('availability-choices'),
              showSelectedIcon: false,
              emptySelectionAllowed: true,
              segments: [
                for (final status in AvailabilityStatus.values)
                  ButtonSegment(value: status, label: Text(status.button)),
              ],
              selected: {?data.status},
              onSelectionChanged: saving
                  ? null
                  : (values) {
                      if (values.isNotEmpty) save(values.single);
                    },
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('availability-note'),
              controller: note,
              maxLength: 200,
              enabled: !saving,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                hintText: 'e.g. first half only',
              ),
            ),
            if (data.status != null && noteChanged)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: saving ? null : () => save(data.status!),
                  child: const Text('SAVE NOTE'),
                ),
              ),
          ] else ...[
            if (data.status == null)
              const Text('You didn’t answer for this match.')
            else
              Row(
                children: [
                  const Text('You said '),
                  AvailabilityPill(status: data.status!),
                ],
              ),
            if (data.note != null) ...[
              const SizedBox(height: 6),
              Text('“${data.note}”', style: textTheme.bodyMedium),
            ],
            const SizedBox(height: 6),
            Text('Answers are closed.', style: textTheme.bodySmall),
          ],
          const SizedBox(height: 8),
          Text(
            data.counts.summary,
            key: const Key('availability-counts'),
            style: textTheme.bodySmall,
          ),
        ],
      );
    }
    if (widget.embedded) return body;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeading('CAN YOU PLAY?'),
        Panel(child: body),
      ],
    );
  }
}

/// Shown on a match page to signed-out visitors in builds with sign-in.
class AvailabilitySignInPrompt extends StatelessWidget {
  const AvailabilitySignInPrompt({super.key});

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
    child: Row(
      children: [
        const Expanded(child: Text('Sign in to say if you can play.')),
        TextButton(
          onPressed: () => context.go(clubPath),
          child: const Text('SIGN IN'),
        ),
      ],
    ),
  );
}
