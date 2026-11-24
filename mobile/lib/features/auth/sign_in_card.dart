import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import 'auth_service.dart';

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
                Text(user.displayName, style: textTheme.titleMedium),
                if (user.email != null)
                  Text(user.email!, style: textTheme.bodySmall),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    FilledButton(
                      onPressed: () => context.push(profilePath),
                      child: const Text('MY PROFILE'),
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
            return _NotInvited(auth: auth);
          default:
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Players sign in with the Google account the club invited.',
                ),
                if (auth.message != null) ...[
                  const SizedBox(height: 6),
                  Text(auth.message!, style: textTheme.bodySmall),
                ],
                const SizedBox(height: 12),
                if (auth.canSignIn)
                  FilledButton.icon(
                    onPressed: auth.signIn,
                    icon: const Icon(Icons.login),
                    label: const Text('SIGN IN WITH GOOGLE'),
                  )
                else
                  Text(
                    'Sign in from the Claymores iOS or Android app.',
                    style: textTheme.bodySmall,
                  ),
              ],
            );
        }
      },
    );
  }
}

class _NotInvited extends StatelessWidget {
  const _NotInvited({required this.auth});
  final AuthService auth;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      decoration: BoxDecoration(
        color: Brand.pinkTint,
        border: Border.all(color: Brand.pinkBorder),
        borderRadius: BorderRadius.circular(6),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.mail_outline, color: Brand.ink),
              SizedBox(width: 8),
              Text(
                'NOT INVITED YET',
                style: TextStyle(fontFamily: Brand.display, fontSize: 18),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            auth.message ??
                'This Google account hasn’t been invited to the club app.',
          ),
          const SizedBox(height: 12),
          if (auth.canSignIn)
            OutlinedButton(
              onPressed: auth.signIn,
              child: const Text('TRY ANOTHER ACCOUNT'),
            ),
        ],
      ),
    ),
  );
}
