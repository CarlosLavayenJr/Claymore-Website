import 'package:material_ui/material_ui.dart';

import '../../app/services.dart';
import '../../data/club_repository.dart';
import '../../shared/widgets.dart';

/// Loads the shared schedule and renders loading, error or [builder]'s list.
class ClubDataView extends StatelessWidget {
  const ClubDataView({
    super.key,
    required this.storageKey,
    required this.builder,
  });

  final Object storageKey;
  final List<Widget> Function(BuildContext context, ClubData data) builder;

  @override
  Widget build(BuildContext context) {
    final club = AppScope.of(context).club;
    return ListenableBuilder(
      listenable: club,
      builder: (context, _) => FutureBuilder<ClubData>(
        future: club.data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: FilledButton(
                onPressed: club.reload,
                child: const Text('Retry loading club schedule'),
              ),
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final data = snapshot.data!;
          return RefreshIndicator(
            onRefresh: club.reload,
            child: PageList(
              storageKey: storageKey,
              children: [
                if (data.isSnapshot)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      'Schedule snapshot · 23 Nov 2026',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                ...builder(context, data),
              ],
            ),
          );
        },
      ),
    );
  }
}
