import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/services.dart';
import '../../shared/widgets.dart';

enum Availability {
  available('Available'),
  unsure('Unsure'),
  unavailable('Unavailable');

  const Availability(this.label);
  final String label;
}

/// Player-preview responses, saved on this device by fixture ID. Shared so a
/// response made on one tab shows up immediately on the others.
class AvailabilityStore extends ChangeNotifier {
  AvailabilityStore(this._prefs);

  final SharedPreferencesAsync _prefs;
  final _responses = <String, Future<String?>>{};

  static String _key(String fixtureId) => 'availability.$fixtureId';

  Future<String?> response(String fixtureId) =>
      _responses[fixtureId] ??= _prefs.getString(_key(fixtureId));

  void retry(String fixtureId) {
    _responses.remove(fixtureId);
    notifyListeners();
  }

  Future<void> save(String fixtureId, Availability value) async {
    await _prefs.setString(_key(fixtureId), value.name);
    _responses[fixtureId] = Future.value(value.name);
    notifyListeners();
  }
}

class AvailabilityPicker extends StatefulWidget {
  const AvailabilityPicker({super.key, required this.fixtureId});
  final String fixtureId;

  @override
  State<AvailabilityPicker> createState() => _AvailabilityPickerState();
}

class _AvailabilityPickerState extends State<AvailabilityPicker> {
  bool saving = false;

  Future<void> save(AvailabilityStore store, Availability value) async {
    setState(() => saving = true);
    try {
      await store.save(widget.fixtureId, value);
    } on Exception {
      if (mounted) showMessage(context, 'Could not save availability.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = AppScope.of(context).availability;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) => FutureBuilder<String?>(
        future: store.response(widget.fixtureId),
        builder: (context, snapshot) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Divider(),
            const Text('Can you play?'),
            Text(
              'Player preview · saved on this device',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (snapshot.hasError)
              TextButton(
                onPressed: () => store.retry(widget.fixtureId),
                child: const Text('Retry loading availability'),
              )
            else
              Wrap(
                spacing: 8,
                children: [
                  for (final value in Availability.values)
                    ChoiceChip(
                      label: Text(value.label),
                      selected: snapshot.data == value.name,
                      onSelected:
                          saving ||
                              snapshot.connectionState != ConnectionState.done
                          ? null
                          : (_) => save(store, value),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
