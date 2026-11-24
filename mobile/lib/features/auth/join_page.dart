import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../shared/widgets.dart';
import 'auth_service.dart';
import 'sign_in_card.dart';

/// `/club/join`: ask the club to let a not-invited Google account or Apple ID
/// in. Uses the identity from the sign-in that just failed (memory only).
class JoinPage extends StatelessWidget {
  const JoinPage({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    return Scaffold(
      appBar: AppBar(title: const Text('JOIN THE CLUB')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: ListenableBuilder(
            listenable: auth,
            builder: (context, _) => PageList(
              children: [
                const _Hero(),
                const SizedBox(height: 20),
                _body(context, auth),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, AuthService auth) {
    final join = auth.joinIdentity;
    if (auth.signedIn) {
      return _Outcome(
        eyebrow: 'Welcome',
        title: 'You’re in',
        body: 'You’re signed in as a club member.',
        action: FilledButton(
          onPressed: () => context.go(profilePath),
          child: const Text('MY PROFILE'),
        ),
      );
    }
    if (auth.status == AuthStatus.signingIn ||
        auth.status == AuthStatus.restoring ||
        auth.joinState == JoinState.checking) {
      return const Panel(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    if (join == null) {
      return _Outcome(
        eyebrow: 'Step 1',
        title: 'Sign in first',
        body:
            auth.message ??
            'Sign in with Google or Apple so the club knows who’s asking. '
                'If you’re not on the list yet, you can send your request here.',
        action: auth.canSignIn || auth.canSignInWithApple
            ? SignInButtons(auth: auth, openJoinOnNotInvited: false)
            : Text(
                'Requests are sent from the Claymores iOS or Android app.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
      );
    }
    final checkStatus = TextButton(
      onPressed: auth.joinBusy ? null : auth.checkJoinStatus,
      child: const Text('Check status'),
    );
    return switch (auth.joinState) {
      JoinState.pending => _Outcome(
        key: const Key('join-pending'),
        featured: true,
        icon: Icons.mark_email_read_outlined,
        eyebrow: 'Request sent',
        title: 'We’ve got it',
        body: [
          'Your request is with the club',
          if (auth.joinEmail ?? join.email case final email?) ' for $email',
          '. A club admin will review it, and once you’re approved you can '
              'sign in here.',
        ].join(),
        action: checkStatus,
      ),
      JoinState.approved => _Outcome(
        key: const Key('join-approved'),
        featured: true,
        icon: Icons.verified_outlined,
        eyebrow: 'Approved',
        title: 'You’re approved — sign in',
        body: 'Welcome to the Claymores. Sign in to finish setting up.',
        action: SignInButtons(auth: auth, openJoinOnNotInvited: false),
      ),
      JoinState.alreadyMember => _Outcome(
        key: const Key('join-member'),
        icon: Icons.verified_outlined,
        eyebrow: 'Already a member',
        title: 'Just sign in',
        body: 'This account is already on the club’s member list.',
        action: SignInButtons(auth: auth, openJoinOnNotInvited: false),
      ),
      JoinState.denied => const _Outcome(
        key: Key('join-denied'),
        eyebrow: 'Request declined',
        title: 'Not this time',
        body:
            'The club couldn’t approve this request. If you think that’s a '
            'mistake, talk to a club admin at practice.',
      ),
      JoinState.deniedRecently => const _Outcome(
        key: Key('join-denied-recently'),
        eyebrow: 'Request declined',
        title: 'Please wait',
        body:
            'A request from this account was declined recently. Talk to a '
            'club admin before asking again.',
      ),
      _ => _JoinForm(
        key: ValueKey(join),
        auth: auth,
        join: join,
        checkStatus: join.provider == JoinProvider.apple ? checkStatus : null,
      ),
    };
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Image.asset(
        'assets/crest.png',
        width: 44,
        height: 68,
        excludeFromSemantics: true,
      ),
      const SizedBox(width: 16),
      const Expanded(
        child: BrandHeader(
          eyebrow: 'Claymores RFC',
          title: 'Request to join',
          body:
              'Players, coaches and volunteers welcome. Tell us a little '
              'about yourself and a club admin will get back to you.',
        ),
      ),
    ],
  );
}

class _Outcome extends StatelessWidget {
  const _Outcome({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.body,
    this.action,
    this.icon,
    this.featured = false,
  });

  final String eyebrow, title, body;
  final Widget? action;
  final IconData? icon;
  final bool featured;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Panel(
      featured: featured,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, color: Brand.blue, size: 32),
            const SizedBox(height: 10),
          ],
          BrandHeader(
            eyebrow: eyebrow,
            title: title,
            body: body,
            titleSize: 22,
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    ),
  );
}

class _JoinForm extends StatefulWidget {
  const _JoinForm({
    super.key,
    required this.auth,
    required this.join,
    this.checkStatus,
  });

  final AuthService auth;
  final JoinIdentity join;

  /// Apple only: its status check needs another Apple sheet, so it's offered
  /// instead of run automatically.
  final Widget? checkStatus;

  @override
  State<_JoinForm> createState() => _JoinFormState();
}

class _JoinFormState extends State<_JoinForm> {
  late final name = TextEditingController(text: widget.join.name ?? '');
  final phone = TextEditingController();
  final message = TextEditingController();
  JoinError? error;

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    message.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    FocusScope.of(context).unfocus();
    final result = await widget.auth.requestToJoin(
      name: name.text,
      phone: phone.text,
      message: message.text,
    );
    if (mounted) setState(() => error = result);
  }

  String? fieldError(String field) =>
      error?.field == field ? error!.message : null;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final join = widget.join;
    final busy = widget.auth.joinBusy;
    final provider = join.provider == JoinProvider.google ? 'Google' : 'Apple';
    final general = error != null && error!.field == null ? error : null;
    final apple = join.provider == JoinProvider.apple;
    return Panel(
      padding: const EdgeInsets.all(20),
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Eyebrow('Your details'),
            const SizedBox(height: 6),
            Text(
              join.email == null
                  ? 'Signed in with $provider.'
                  : 'Signed in with $provider as ${join.email}.',
              style: textTheme.bodySmall,
            ),
            // Apple's private relay explanation stays visible here.
            if (apple && widget.auth.message != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Brand.pinkTint,
                  border: Border.all(color: Brand.pinkBorder),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(widget.auth.message!, style: textTheme.bodySmall),
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              key: const Key('join-name'),
              controller: name,
              enabled: !busy,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name],
              decoration: InputDecoration(
                labelText: 'Full name',
                errorText: fieldError('name'),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              key: const Key('join-phone'),
              controller: phone,
              enabled: !busy,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: InputDecoration(
                labelText: 'Phone (optional)',
                helperText: 'So a club admin can text you about practice.',
                errorText: fieldError('phone'),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              key: const Key('join-message'),
              controller: message,
              enabled: !busy,
              minLines: 3,
              maxLines: 6,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Message (optional)',
                hintText: 'Tell us about your rugby experience',
                alignLabelWithHint: true,
                errorText: fieldError('message'),
              ),
            ),
            if (general != null) ...[
              const SizedBox(height: 6),
              Semantics(
                liveRegion: true,
                child: Text(
                  general.message,
                  style: textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : submit,
              child: busy
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('SEND REQUEST'),
            ),
            if (apple) ...[
              const SizedBox(height: 6),
              Text(
                'Apple will ask you to confirm once more before sending.',
                textAlign: TextAlign.center,
                style: textTheme.bodySmall,
              ),
            ],
            if (widget.checkStatus != null) ...[
              const SizedBox(height: 4),
              Center(child: widget.checkStatus),
            ],
          ],
        ),
      ),
    );
  }
}
