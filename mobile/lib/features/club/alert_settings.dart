import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../shared/widgets.dart';
import 'notifications.dart';

class AlertSettings extends StatefulWidget {
  const AlertSettings({
    super.key,
    required this.notifications,
    required this.prefs,
  });
  final ClubNotifications notifications;
  final SharedPreferencesAsync prefs;

  @override
  State<AlertSettings> createState() => _AlertSettingsState();
}

class _AlertSettingsState extends State<AlertSettings> {
  late Future<Set<ClubAlert>> alerts = loadAlerts();
  bool saving = false;

  Future<Set<ClubAlert>> loadAlerts() async => {
    for (final alert in ClubAlert.values)
      if (await widget.prefs.getBool('alerts.${alert.name}') ?? false) alert,
  };

  Future<void> change(
    ClubAlert alert,
    bool enabled,
    Set<ClubAlert> current,
  ) async {
    setState(() => saving = true);
    try {
      await widget.notifications.subscribe(alert, enabled);
      await widget.prefs.setBool('alerts.${alert.name}', enabled);
      if (mounted) {
        setState(() {
          alerts = Future.value({
            ...current.where((item) => item != alert),
            if (enabled) alert,
          });
        });
      }
    } on StateError catch (error) {
      if (mounted) showMessage(context, error.message);
    } on Exception {
      if (mounted) {
        showMessage(context, 'Could not update notifications. Try again.');
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Set<ClubAlert>>(
    future: alerts,
    builder: (context, snapshot) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!widget.notifications.supported)
          Text(
            'Push requires a configured iOS or Android build.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        if (snapshot.hasError)
          TextButton(
            onPressed: () => setState(() {
              alerts = loadAlerts();
            }),
            child: const Text('Retry loading notification preferences'),
          ),
        for (final alert in ClubAlert.values)
          SwitchListTile(
            title: Text(alert.label),
            contentPadding: EdgeInsets.zero,
            value: snapshot.data?.contains(alert) ?? false,
            onChanged:
                widget.notifications.supported && !saving && snapshot.hasData
                ? (enabled) => change(alert, enabled, snapshot.data!)
                : null,
          ),
      ],
    ),
  );
}
