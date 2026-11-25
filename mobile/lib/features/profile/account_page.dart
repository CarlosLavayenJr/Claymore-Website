import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../auth/auth_service.dart';
import 'full_name_form.dart';

/// `/club/profile` (opened from the gear on the Club tab): who is signed in,
/// the sign-ins that open the account, sign out and delete account. Dues
/// and club admin live on the Club tab.
class AccountPage extends StatelessWidget {
  const AccountPage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return Scaffold(
      appBar: AppBar(title: const Text('ACCOUNT')),
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
                    StatusPanel(
                      message: 'Sign in to see your account.',
                      action: FilledButton(
                        onPressed: () => context.go(clubPath),
                        child: const Text('GO TO CLUB'),
                      ),
                    ),
                  ],
                );
              }
              return _SignedInAccount(user: user, members: members);
            },
          ),
        ),
      ),
    );
  }
}

class _SignedInAccount extends StatefulWidget {
  const _SignedInAccount({required this.user, required this.members});

  final AuthUser user;
  final MemberRepository members;

  @override
  State<_SignedInAccount> createState() => _SignedInAccountState();
}

class _SignedInAccountState extends State<_SignedInAccount> {
  /// Which sign-ins open this account; null until loaded or when it fails.
  Future<Set<String>>? identities;

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    identities = widget.members.identities();
  }

  Future<void> refresh() async {
    setState(load);
    await identities?.then<void>((_) {}, onError: (Object _) {});
  }

  Future<void> changeName() async {
    final messenger = ScaffoldMessenger.of(context);
    final name = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) =>
            ChangeNamePage(user: widget.user, members: widget.members),
      ),
    );
    if (name != null) {
      messenger.showSnackBar(SnackBar(content: Text('Saved: $name')));
    }
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
          Panel(
            padding: const EdgeInsets.all(20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      BrandHeader(
                        eyebrow: user.role == null
                            ? 'Claymores RFC'
                            : 'Claymores RFC · ${user.role}',
                        title: user.displayName,
                      ),
                      if (user.email != null) ...[
                        const SizedBox(height: 10),
                        Text(user.email!, style: textTheme.bodySmall),
                      ],
                      const SizedBox(height: 12),
                      OutlinedButton(
                        key: const Key('change-name'),
                        onPressed: changeName,
                        child: const Text('CHANGE NAME'),
                      ),
                    ],
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
          ),
          const SizedBox(height: 24),
          const SectionHeading('SIGN-IN'),
          _SignInMethods(
            members: widget.members,
            identities: identities,
            onLinked: () => setState(load),
          ),
          const SizedBox(height: 24),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: OutlinedButton(
              key: const Key('sign-out'),
              onPressed: () async {
                await auth.signOut();
                if (context.mounted) context.go(clubPath);
              },
              child: const Text('SIGN OUT'),
            ),
          ),
          const SizedBox(height: 40),
          const Divider(),
          const SizedBox(height: 8),
          DeleteAccountButton(members: widget.members),
        ],
      ),
    );
  }
}

/// "Delete account" at the bottom of the account page (App Store 5.1.1(v)).
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
