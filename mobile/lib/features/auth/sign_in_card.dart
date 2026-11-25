import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../shared/widgets.dart';
import 'auth_service.dart';
import 'google_button.dart';

/// Club tab account section: sign in, signed-in summary, not-invited notice.
class SignInCard extends StatelessWidget {
  const SignInCard({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = AppScope.of(context).auth;
    final textTheme = Theme.of(context).textTheme;
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) {
        final user = auth.user;
        switch (auth.status) {
          case AuthStatus.restoring || AuthStatus.signingIn:
            return const Padding(
              padding: EdgeInsets.all(8),
              child: Center(child: CircularProgressIndicator()),
            );
          case AuthStatus.signedIn when user != null:
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BrandHeader(
                  eyebrow: user.role == null
                      ? 'Signed in'
                      : 'Signed in · ${user.roleLabel}',
                  title: user.displayName,
                  titleSize: 22,
                ),
                if (user.email != null) ...[
                  const SizedBox(height: 8),
                  Text(user.email!, style: textTheme.bodySmall),
                ],
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    FilledButton(
                      onPressed: () => context.push(accountPath),
                      child: const Text('ACCOUNT'),
                    ),
                    OutlinedButton(
                      onPressed: auth.signOut,
                      child: const Text('SIGN OUT'),
                    ),
                  ],
                ),
              ],
            );
          case AuthStatus.notInvited:
            return NotInvitedNotice(auth: auth);
          default:
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BrandHeader(
                  eyebrow: 'Players',
                  title: 'Sign in',
                  body: auth.canSignInWithApple
                      ? 'Use the email address the club invited.'
                      : 'Use the Google account the club invited.',
                ),
                if (auth.message != null) ...[
                  const SizedBox(height: 8),
                  Text(auth.message!, style: textTheme.bodySmall),
                ],
                if (auth.canRetryRestore) ...[
                  const SizedBox(height: 12),
                  OutlinedButton(
                    key: const Key('retry-restore'),
                    onPressed: auth.retryRestore,
                    child: const Text('TRY AGAIN'),
                  ),
                ],
                const SizedBox(height: 16),
                if (auth.canSignIn || auth.canSignInWithApple) ...[
                  SignInButtons(auth: auth),
                  const SizedBox(height: 12),
                  Text(
                    'New to the Claymores? Sign in the same way and you can '
                    'ask to join.',
                    style: textTheme.bodySmall,
                  ),
                ] else
                  Text(
                    'Sign-in isn’t available in this version.',
                    style: textTheme.bodySmall,
                  ),
              ],
            );
        }
      },
    );
  }
}

/// Shown after a sign-in the club didn't recognise.
class NotInvitedNotice extends StatelessWidget {
  const NotInvitedNotice({super.key, required this.auth});
  final AuthService auth;

  @override
  Widget build(BuildContext context) {
    final pending = auth.joinState == JoinState.pending;
    final approved = auth.joinState == JoinState.approved;
    return Semantics(
      liveRegion: true,
      child: Container(
        decoration: BoxDecoration(
          color: Brand.pinkTint,
          border: Border.all(color: Brand.pinkBorder),
          borderRadius: BorderRadius.circular(6),
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BrandHeader(
              eyebrow: pending
                  ? 'Request pending'
                  : approved
                  ? 'Approved'
                  : 'Not on the list yet',
              title: approved ? 'Sign in again' : 'Join the club',
              titleSize: 22,
              body: approved
                  ? 'You’re approved. Sign in to finish.'
                  : pending
                  ? 'Your request is with the club. We’ll let you know.'
                  : auth.message ??
                        'This account hasn’t been invited to the club app.',
            ),
            const SizedBox(height: 14),
            if (auth.joinIdentity != null && !approved) ...[
              FilledButton(
                onPressed: () => context.push(joinPath),
                child: Text(pending ? 'VIEW REQUEST' : 'REQUEST TO JOIN'),
              ),
              const SizedBox(height: 14),
            ],
            if (auth.canSignIn || auth.canSignInWithApple)
              SignInButtons(auth: auth, googleLabel: 'Use another account'),
          ],
        ),
      ),
    );
  }
}

/// Google (per Google's branding) and, on iOS, Sign in with Apple (per
/// Apple's HIG: black, Apple logo, standard label), the same size.
///
/// After a not-invited sign-in it opens the join screen, unless
/// [openJoinOnNotInvited] is false (the join screen itself).
class SignInButtons extends StatelessWidget {
  const SignInButtons({
    super.key,
    required this.auth,
    this.openJoinOnNotInvited = true,
    this.googleLabel = 'Sign in with Google',
  });

  final AuthService auth;
  final bool openJoinOnNotInvited;
  final String googleLabel;

  static const _maxWidth = 320.0;

  Future<void> _run(
    BuildContext context,
    Future<void> Function() signIn,
  ) async {
    final router = GoRouter.maybeOf(context);
    await signIn();
    if (openJoinOnNotInvited &&
        router != null &&
        auth.status == AuthStatus.notInvited &&
        auth.joinIdentity != null) {
      router.push(joinPath);
    }
  }

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: _maxWidth),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (auth.canSignInWithApple)
          SizedBox(
            height: signInButtonHeight,
            child: SignInWithAppleButton(
              key: const Key('sign-in-with-apple'),
              height: signInButtonHeight,
              borderRadius: const BorderRadius.all(Radius.circular(8)),
              onPressed: () => _run(context, auth.signInWithApple),
            ),
          ),
        if (auth.canSignIn && auth.canSignInWithApple)
          const SizedBox(height: 10),
        if (auth.canSignIn)
          GoogleSignInButton(
            label: googleLabel,
            onPressed: () => _run(context, auth.signIn),
          ),
      ],
    ),
  );
}
