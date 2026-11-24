import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/config.dart';
import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../shared/widgets.dart';
import '../auth/sign_in_card.dart';
import 'alert_settings.dart';

class ClubPage extends StatelessWidget {
  const ClubPage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return ListenableBuilder(
      listenable: Listenable.merge([services.playerPreview, auth]),
      builder: (context, _) {
        final playerPreview = services.playerPreview.value;
        return PageList(
          storageKey: 'club',
          children: [
            const SectionHeading('CLUB'),
            Panel(
              child: SwitchListTile(
                title: const Text('Player preview'),
                subtitle: const Text(
                  'Try match availability. Responses stay on this device.',
                ),
                value: playerPreview,
                contentPadding: EdgeInsets.zero,
                onChanged: (value) => services.playerPreview.value = value,
              ),
            ),
            if (auth.enabled) ...[
              const SizedBox(height: 20),
              const SectionHeading('ACCOUNT'),
              const Panel(child: SignInCard()),
            ] else if (AppConfig.signInEnabled && kDebugMode) ...[
              const SizedBox(height: 20),
              const StatusPanel(
                message: 'Sign-in isn’t configured for this build.',
                detail:
                    'Set CLAYMORES_API_BASE_URL and GOOGLE_SERVER_CLIENT_ID '
                    '(see README). Release builds hide this section.',
              ),
            ],
            const SizedBox(height: 20),
            const SectionHeading('NOTIFICATIONS'),
            Panel(
              child: AlertSettings(
                notifications: services.notifications,
                prefs: services.prefs,
              ),
            ),
            if (AppConfig.duesEnabled && (playerPreview || auth.signedIn)) ...[
              const SizedBox(height: 20),
              const SectionHeading('PLAYER DUES'),
              Panel(
                child: auth.signedIn
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('See your balance and pay by card.'),
                          const SizedBox(height: 12),
                          OutlinedButton(
                            onPressed: () => context.push(profilePath),
                            child: const Text('VIEW DUES'),
                          ),
                        ],
                      )
                    : Text(
                        auth.enabled
                            ? 'Sign in to see your dues and pay by card.'
                            : 'Dues preview. Payment and balance tracking '
                                  'need sign-in.',
                      ),
              ),
            ],
          ],
        );
      },
    );
  }
}
