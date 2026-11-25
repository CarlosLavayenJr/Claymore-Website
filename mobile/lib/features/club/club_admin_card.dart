import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../shared/widgets.dart';
import '../admin/admin_page.dart';

/// Live counts for the Club tab's admin card.
class ClubAdminCounts {
  const ClubAdminCounts({this.paid, this.total, this.pendingRequests});

  /// Assessments settled, of [total]; null when dues didn't load.
  final int? paid, total;

  /// Join requests waiting; null when they didn't load.
  final int? pendingRequests;

  static Future<ClubAdminCounts> load(AdminRepository admin) async {
    Future<T?> orNull<T>(Future<T> f) =>
        f.then<T?>((v) => v, onError: (Object _) => null);
    final dues = orNull(admin.allDues());
    final requests = orNull(admin.joinRequests());
    final all = await dues;
    final pending = await requests;
    return ClubAdminCounts(
      paid: all?.where((d) => d.settled).length,
      total: all?.length,
      pendingRequests: pending?.length,
    );
  }

  /// "Dues: 12 of 30 paid", or null when unknown.
  String? get duesLine =>
      paid == null || total == null ? null : 'Dues: $paid of $total paid';

  /// "Join requests: 2", or null when unknown.
  String? get requestsLine =>
      pendingRequests == null ? null : 'Join requests: $pendingRequests';
}

/// "Club admin" card on the Club tab, for admins only: how many players have
/// paid and how many join requests wait. Opens [adminPath].
class ClubAdminCard extends StatefulWidget {
  const ClubAdminCard({super.key, required this.admin});

  /// Null in builds without an API; the card then shows no counts.
  final AdminRepository? admin;

  @override
  State<ClubAdminCard> createState() => ClubAdminCardState();
}

class ClubAdminCardState extends State<ClubAdminCard> {
  Future<ClubAdminCounts>? counts;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(ClubAdminCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.admin != widget.admin) load();
  }

  void load() {
    final admin = widget.admin;
    counts = admin == null ? null : ClubAdminCounts.load(admin);
  }

  /// Reloads the counts (pull to refresh on the Club tab).
  Future<void> refresh() async {
    setState(load);
    await counts?.then<void>((_) {}, onError: (Object _) {});
  }

  Future<void> open() async {
    await context.push(adminPath);
    if (mounted) setState(load);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return FutureBuilder<ClubAdminCounts>(
      future: counts,
      builder: (context, snapshot) {
        final loading =
            counts != null && snapshot.connectionState != ConnectionState.done;
        final data = snapshot.data;
        final lines = [?data?.duesLine, ?data?.requestsLine];
        if (lines.isEmpty && !loading) lines.add('Dues and join requests');
        return Panel(
          key: const Key('club-admin-entry'),
          featured: true,
          padding: EdgeInsets.zero,
          child: Semantics(
            button: true,
            label: [
              'Club admin',
              if (loading) 'loading' else ...lines,
            ].join('. '),
            excludeSemantics: true,
            child: InkWell(
              onTap: open,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Icon(Icons.admin_panel_settings_outlined),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('CLUB ADMIN', style: displayStyle(20)),
                          const SizedBox(height: 2),
                          if (loading)
                            Text('Loading…', style: textTheme.bodySmall)
                          else
                            for (final line in lines)
                              Text(
                                line,
                                style: textTheme.bodyMedium?.copyWith(
                                  fontFeatures: tabularFigures,
                                ),
                              ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Brand.secondary),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
