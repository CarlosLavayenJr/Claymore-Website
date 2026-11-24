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
      listenable: auth,
      builder: (context, _) {
        return PageList(
          storageKey: 'club',
          children: [
            if (auth.enabled) ...[
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
            if (AppConfig.notificationsEnabled) ...[
              const SizedBox(height: 20),
              const SectionHeading('NOTIFICATIONS'),
              Panel(
                child: AlertSettings(
                  notifications: services.notifications,
                  prefs: services.prefs,
                ),
              ),
            ],
            if (AppConfig.duesEnabled && auth.signedIn) ...[
              const SizedBox(height: 20),
              const SectionHeading('PLAYER DUES'),
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('See your balance and pay by card.'),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => context.push(profilePath),
                      child: const Text('VIEW DUES'),
                    ),
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
