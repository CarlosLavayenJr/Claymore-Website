import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';

/// First and last name, saved with `PUT /v1/me/name` as "First Last". The
/// session is then refreshed so the new name shows everywhere at once.
/// Used by the Club tab's "What's your full name?" card and by Change name
/// on the account page.
class FullNameForm extends StatefulWidget {
  const FullNameForm({
    super.key,
    required this.members,
    required this.initialName,
    this.onSaved,
    this.autofocus = false,
  });

  final MemberRepository members;

  /// Prefills the fields: first word / the rest.
  final String? initialName;

  /// Called with the stored name after it was saved.
  final ValueChanged<String>? onSaved;
  final bool autofocus;

  @override
  State<FullNameForm> createState() => _FullNameFormState();
}

class _FullNameFormState extends State<FullNameForm> {
  late final TextEditingController first, last;
  String? firstError, lastError;

  /// The API's 400 message, or a length problem.
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final parts = splitMemberName(widget.initialName);
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
      firstError = missingFirst ? 'Enter your first name.' : null;
      lastError = missingLast ? 'Enter your last name.' : null;
      error = missingFirst || missingLast ? null : joined.error;
    });
    final name = joined.name;
    if (name == null) return;

    final auth = AppScope.of(context).auth;
    final messenger = ScaffoldMessenger.of(context);
    void say(String text) =>
        messenger.showSnackBar(SnackBar(content: Text(text)));
    setState(() => busy = true);
    try {
      final saved = await widget.members.setName(name);
      TextInput.finishAutofillContext();
      await auth.refreshUser(name: saved);
      // The Club tab's card is gone once the name is full.
      if (!mounted) return;
      setState(() => busy = false);
      widget.onSaved?.call(saved);
      return;
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 400) {
        setState(() => error = e.error ?? 'Check your name and try again.');
      } else if (e.statusCode == 401) {
        say('Your session ended. Sign in again.');
      } else {
        say('Couldn’t save your name (${e.statusCode}). Try again.');
      }
    } on Exception {
      if (!mounted) return;
      say('Couldn’t save your name. Check your connection and try again.');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            key: const Key('first-name'),
            controller: first,
            autofocus: widget.autofocus,
            enabled: !busy,
            autofillHints: const [AutofillHints.givenName],
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            maxLength: maxMemberNameLength,
            buildCounter: _noCounter,
            decoration: InputDecoration(
              labelText: 'First name',
              errorText: firstError,
            ),
            onChanged: (_) {
              if (firstError != null) setState(() => firstError = null);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('last-name'),
            controller: last,
            enabled: !busy,
            autofillHints: const [AutofillHints.familyName],
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.done,
            maxLength: maxMemberNameLength,
            buildCounter: _noCounter,
            decoration: InputDecoration(
              labelText: 'Last name',
              errorText: lastError,
            ),
            onChanged: (_) {
              if (lastError != null) setState(() => lastError = null);
            },
            onSubmitted: (_) => save(),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(
              error!,
              key: const Key('name-error'),
              style: textTheme.bodySmall?.copyWith(color: Brand.danger),
            ),
          ],
          const SizedBox(height: 16),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FilledButton(
              key: const Key('save-name'),
              onPressed: busy ? null : save,
              child: Text(busy ? 'SAVING…' : 'SAVE'),
            ),
          ),
        ],
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

/// The Club tab's prompt when the member's name is missing, one word, or an
/// email address (Google sometimes sends a first name only; Apple sends the
/// name once).
class FullNameCard extends StatelessWidget {
  const FullNameCard({super.key, required this.user, required this.members});

  final AuthUser user;
  final MemberRepository members;

  @override
  Widget build(BuildContext context) {
    final source = user.subject.startsWith('apple|')
        ? 'Your Apple ID'
        : 'Your Google account';
    return Panel(
      key: const Key('full-name-card'),
      featured: true,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BrandHeader(
            eyebrow: 'Claymores RFC',
            title: 'What’s your full name?',
            titleSize: 22,
            body:
                '$source only gave us part of it. Coaches use it for '
                'lineups and dues.',
          ),
          const SizedBox(height: 16),
          FullNameForm(members: members, initialName: user.name),
        ],
      ),
    );
  }
}

/// Change name, opened from the account page: the same form, full screen so
/// its snackbars show.
class ChangeNamePage extends StatelessWidget {
  const ChangeNamePage({super.key, required this.user, required this.members});

  final AuthUser user;
  final MemberRepository members;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('YOUR NAME')),
    body: SafeArea(
      top: false,
      child: ContentWidth(
        child: PageList(
          children: [
            Panel(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const BrandHeader(
                    eyebrow: 'Claymores RFC',
                    title: 'Your name',
                    titleSize: 22,
                    body:
                        'As the club shows it. Coaches use it for lineups '
                        'and dues.',
                  ),
                  const SizedBox(height: 16),
                  FullNameForm(
                    members: members,
                    initialName: user.name,
                    autofocus: true,
                    onSaved: (name) => Navigator.of(context).pop(name),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
