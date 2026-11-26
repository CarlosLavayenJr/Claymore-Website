import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';
import '../auth/auth_service.dart';
import '../fixtures/fixture_card.dart' show FixtureBadge, matchLocation;
import '../fixtures/lineup.dart' show LineupEditorPage;
import '../profile/payment_amount.dart';
import 'admin_matches.dart';
import 'admin_invites.dart';
import 'dues_forms.dart';
import 'admin_people.dart';
import 'dues_summary.dart';
import 'player_dues_page.dart';

/// `/club/profile/admin`.
const adminPath = '$profilePath/admin';

/// Whether [user] can open the club admin screens.
bool isClubAdmin(AuthUser? user) => user?.isClubAdmin ?? false;

/// The Club Admin tabs, as on the website (`?tab=`).
enum AdminTab {
  matches('MATCHES'),
  people('PEOPLE'),
  dues('DUES');

  const AdminTab(this.label);
  final String label;

  /// `?tab=people` → [people]; anything else is [matches].
  static AdminTab parse(String? value) =>
      values.where((t) => t.name == value).firstOrNull ?? matches;
}

/// `/club/profile/admin`, the app's version of the website's Club Admin:
/// four overview tiles (next match, join requests, dues outstanding, missing
/// last names), then the Matches, People and Dues tabs. The API enforces the
/// admin role; the app only hides the entry for everyone else.
class AdminPage extends StatelessWidget {
  const AdminPage({super.key, this.initialTab = AdminTab.matches});

  final AdminTab initialTab;

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    final auth = services.auth;
    return Scaffold(
      appBar: AppBar(title: const Text('CLUB ADMIN')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: ListenableBuilder(
            listenable: auth,
            builder: (context, _) {
              if (auth.status == AuthStatus.restoring) {
                return const Center(child: CircularProgressIndicator());
              }
              final admin = services.admin;
              final Widget? blocked = !auth.signedIn
                  ? StatusPanel(
                      message: 'Sign in as a club admin to manage the club.',
                      action: FilledButton(
                        onPressed: () => context.go('/club'),
                        child: const Text('GO TO CLUB'),
                      ),
                    )
                  : !isClubAdmin(auth.user)
                  ? const StatusPanel(
                      message: 'Only club admins can open this page.',
                    )
                  : admin == null
                  ? const StatusPanel(
                      message: 'Club admin isn’t available in this build.',
                    )
                  : null;
              if (blocked != null) return PageList(children: [blocked]);
              return _AdminBody(
                admin: admin!,
                club: services.club,
                initialTab: initialTab,
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Dues plus the member names that label them. [members] is null when the
/// member list didn't load; names then fall back to "Club member".
class _DuesBoard {
  const _DuesBoard(this.all, this.groups, this.members);
  final List<DuesAssessment> all;
  final List<DuesGroup> groups;
  final Map<String, ClubMember>? members;

  /// What players still owe: the sum of positive balances.
  int get outstandingCents =>
      all.fold(0, (sum, d) => sum + (d.balanceCents > 0 ? d.balanceCents : 0));

  String label(String subject) {
    final members = this.members;
    if (members == null) return 'Club member';
    return members[subject]?.label ?? 'Former member';
  }
}

class _AdminBody extends StatefulWidget {
  const _AdminBody({
    required this.admin,
    required this.club,
    required this.initialTab,
  });

  final AdminRepository admin;
  final ClubDataController club;
  final AdminTab initialTab;

  @override
  State<_AdminBody> createState() => _AdminBodyState();
}

class _AdminBodyState extends State<_AdminBody>
    with SingleTickerProviderStateMixin {
  late final TabController tabs = TabController(
    length: AdminTab.values.length,
    vsync: this,
    initialIndex: widget.initialTab.index,
  );

  AdminTab get tab => AdminTab.values[tabs.index];

  /// The MEMBERS heading, scrolled to from the Missing last name tile.
  final membersKey = GlobalKey();

  Future<List<ClubMember>>? members;
  Future<_DuesBoard>? dues;
  Future<List<AdminJoinRequest>>? requests;
  Future<List<AdminMatch>>? matches;

  /// Dues groups the admin opened; kept across refreshes.
  final expanded = <String>{};

  /// Join requests with an approve/deny in flight.
  final deciding = <String>{};

  @override
  void initState() {
    super.initState();
    tabs.addListener(onTab);
    load();
  }

  @override
  void didUpdateWidget(_AdminBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.admin != widget.admin) load();
  }

  @override
  void dispose() {
    tabs
      ..removeListener(onTab)
      ..dispose();
    super.dispose();
  }

  void onTab() => setState(() {});

  void load() {
    members = widget.admin.members();
    dues = loadDues(members!);
    requests = widget.admin.joinRequests();
    matches = loadMatches();
  }

  Future<List<AdminMatch>> loadMatches() =>
      AdminMatch.load(widget.admin, widget.club.data);

  Future<_DuesBoard> loadDues(Future<List<ClubMember>> members) async {
    final names = members.then<List<ClubMember>?>(
      (list) => list,
      onError: (Object _) => null,
    );
    final all = await widget.admin.allDues();
    final list = await names;
    return _DuesBoard(
      all,
      summarizeDues(all),
      list == null ? null : {for (final m in list) m.subject: m},
    );
  }

  Future<void> assignDues() async {
    final list = await (members ?? widget.admin.members()).then(
      (v) => v,
      onError: (Object _) => <ClubMember>[],
    );
    if (!mounted) return;
    final message = await showAssignDuesSheet(
      context,
      admin: widget.admin,
      members: list,
    );
    if (message == null || !mounted) return;
    showMessage(context, message);
    setState(() {
      dues = loadDues(members!);
    });
  }

  Future<void> automaticDues() async {
    final message = await showAutomaticDuesSheet(context, admin: widget.admin);
    if (message != null && mounted) showMessage(context, message);
  }

  /// Pull to refresh: the tiles and every tab, which share the same data.
  Future<void> refresh() async {
    setState(load);
    await Future.wait<Object?>([
      for (final future in <Future<Object?>>[
        members!,
        dues!,
        requests!,
        matches!,
      ])
        future.then<Object?>((v) => v, onError: (Object _) => null),
    ]);
  }

  /// Switches to [to]; [toMembers] then scrolls to the member list.
  void go(AdminTab to, {bool toMembers = false}) {
    tabs.animateTo(to.index);
    if (!toMembers) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = membersKey.currentContext;
      if (target != null && target.mounted) {
        Scrollable.ensureVisible(
          target,
          duration: const Duration(milliseconds: 250),
        );
      }
    });
  }

  /// Opens the match page (availability breakdown and lineup editor), then
  /// reloads the matches in case the lineup changed.
  Future<void> openLineup(AdminMatch match) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            LineupEditorPage(fixture: match.fixture, admin: widget.admin),
      ),
    );
    if (!mounted) return;
    setState(() {
      matches = loadMatches();
    });
  }

  Future<void> openMatch(AdminMatch match) async {
    await context.push(matchLocation(match.fixture), extra: match.fixture);
    if (!mounted) return;
    setState(() {
      matches = loadMatches();
    });
  }

  /// Opens one player's dues: history, notes, record / edit / undo. The
  /// summary refreshes afterwards if anything changed.
  Future<void> open(DuesAssessment item, String label, String group) async {
    var changed = false;
    await showPlayerDues(
      context,
      admin: widget.admin,
      dues: item,
      memberLabel: label,
      description: group,
      onChanged: () => changed = true,
    );
    if (changed && mounted) await refresh();
  }

  Future<void> editName(ClubMember member) async {
    final me = AppScope.of(context).auth.user;
    final result = await showEditMemberName(
      context,
      admin: widget.admin,
      member: member,
      canSetRole:
          (me?.isSuperAdmin ?? false) &&
          member.email.toLowerCase() != me?.email?.toLowerCase(),
    );
    if (result == null || !mounted) return;
    showMessage(context, switch (result) {
      MemberNameResult.saved => 'Name saved.',
      MemberNameResult.roleSaved =>
        'Role saved. It takes effect within 30 seconds.',
      MemberNameResult.gone => 'That member no longer exists.',
    });
    setState(() {
      members = widget.admin.members();
      dues = loadDues(members!);
    });
  }

  Future<void> decide(
    AdminJoinRequest request, {
    required bool approve,
    String role = 'player',
    String reason = '',
  }) async {
    if (approve && role != 'player') {
      if (!await confirmApproveAdmin(context, request, role: role) ||
          !mounted) {
        return;
      }
    }
    if (!approve) {
      final answer = await showDenyDialog(context, request, reason: reason);
      if (answer == null || !mounted) return;
      reason = answer;
    }
    final messenger = ScaffoldMessenger.of(context);
    setState(() => deciding.add(request.id));
    String message;
    var reload = true;
    try {
      if (approve) {
        await widget.admin.approveJoinRequest(request.id, role: role);
        message = role == 'player'
            ? 'Approved ${request.label}. They can sign in now.'
            : 'Approved ${request.label} as ${role == 'coach' ? 'a coach' : 'an admin'}. '
                  'They can sign in now.';
      } else {
        await widget.admin.denyJoinRequest(request.id, reason: reason);
        message = 'Denied the request from ${request.label}.';
      }
    } on ApiException catch (e) {
      message = switch (e.statusCode) {
        409 when e.error == 'not_pending' =>
          'That request was already decided.',
        409 => e.error ?? 'That change isn’t allowed.',
        404 => 'That request no longer exists.',
        403 => 'Only club admins can do that.',
        401 => 'Your session ended. Sign in again.',
        _ => 'The club server had a problem. Try again in a minute.',
      };
      reload = e.statusCode == 409 || e.statusCode == 404;
    } on Exception {
      message = 'Couldn’t reach the club server. Try again.';
      reload = false;
    }
    if (!mounted) return;
    setState(() => deciding.remove(request.id));
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
    if (reload) await refresh();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: refresh,
    child: PageList(
      children: [
        _overview(context),
        const SizedBox(height: 16),
        _tabBar(),
        const SizedBox(height: 16),
        ...switch (tab) {
          AdminTab.matches => _matchesTab(),
          AdminTab.people => _peopleTab(),
          AdminTab.dues => _duesTab(),
        },
      ],
    ),
  );

  // --- Overview tiles ---

  Widget _overview(BuildContext context) {
    Widget row(Widget a, Widget b) => IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: a),
          const SizedBox(width: 12),
          Expanded(child: b),
        ],
      ),
    );
    return Column(
      children: [
        row(
          FutureBuilder<List<AdminMatch>>(
            future: matches,
            builder: (context, snapshot) {
              final list = snapshot.data;
              final next = list == null || list.isEmpty ? null : list.first;
              final counts = next?.availability?.counts;
              return AdminTile(
                key: const Key('tile-next-match'),
                label: next == null
                    ? 'Next match'
                    : 'Next match · ${shortMatchDate(context, next.fixture.date)}',
                value: snapshot.hasError
                    ? '—'
                    : list == null
                    ? '…'
                    : next == null
                    ? 'None scheduled'
                    : next.title,
                detail: counts == null
                    ? null
                    : [
                        '${counts.available} can play',
                        if (counts.maybe > 0) '${counts.maybe} maybe',
                        '${counts.noReply} no reply',
                      ].join(' · '),
                onTap: () => go(AdminTab.matches),
              );
            },
          ),
          _tile<List<AdminJoinRequest>>(
            key: const Key('tile-join-requests'),
            label: 'Join requests',
            future: requests,
            describe: (list) => list.isEmpty
                ? ('None waiting', false)
                : ('${list.length} waiting', true),
            onTap: () => go(AdminTab.people),
          ),
        ),
        const SizedBox(height: 12),
        // The missing-last-name tile only shows while someone is missing one.
        FutureBuilder<List<ClubMember>>(
          future: members,
          builder: (context, snapshot) {
            final duesTile = _tile<_DuesBoard>(
              key: const Key('tile-dues-outstanding'),
              label: 'Dues outstanding',
              future: dues,
              describe: (board) => (formatCents(board.outstandingCents), false),
              onTap: () => go(AdminTab.dues),
            );
            final missing = snapshot.hasData
                ? missingLastNames(snapshot.data!)
                : 0;
            if (missing == 0) return duesTile;
            return row(
              duesTile,
              _tile<List<ClubMember>>(
                key: const Key('tile-missing-last-name'),
                label: 'Missing last name',
                future: members,
                describe: (list) => ('${missingLastNames(list)}', true),
                onTap: () => go(AdminTab.people, toMembers: true),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _tile<T>({
    required Key key,
    required String label,
    required Future<T>? future,
    required (String, bool) Function(T data) describe,
    required VoidCallback onTap,
  }) => FutureBuilder<T>(
    future: future,
    builder: (context, snapshot) {
      final (value, alert) = snapshot.hasData
          ? describe(snapshot.data as T)
          : snapshot.hasError
          ? ('—', false)
          : ('…', false);
      return AdminTile(
        key: key,
        label: label,
        value: value,
        alert: alert,
        onTap: onTap,
      );
    },
  );

  // --- Tabs ---

  Widget _tabBar() => TabBar(
    controller: tabs,
    labelColor: Brand.ink,
    unselectedLabelColor: Brand.secondary,
    indicatorColor: Brand.pink,
    indicatorSize: TabBarIndicatorSize.tab,
    dividerColor: Brand.divider,
    labelPadding: const EdgeInsets.symmetric(horizontal: 4),
    labelStyle: const TextStyle(fontFamily: Brand.display, fontSize: 18),
    unselectedLabelStyle: const TextStyle(
      fontFamily: Brand.display,
      fontSize: 18,
    ),
    tabs: [
      Tab(child: _tabLabel(Text(AdminTab.matches.label))),
      Tab(
        child: FutureBuilder<List<AdminJoinRequest>>(
          future: requests,
          builder: (context, snapshot) {
            final waiting = snapshot.data?.length ?? 0;
            return _tabLabel(
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(AdminTab.people.label),
                  if (waiting > 0) ...[
                    const SizedBox(width: 6),
                    Semantics(
                      label: '$waiting waiting',
                      excludeSemantics: true,
                      child: Container(
                        key: const Key('people-badge'),
                        constraints: const BoxConstraints(minWidth: 20),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: Brand.pink,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '$waiting',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Brand.ink,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
      Tab(child: _tabLabel(Text(AdminTab.dues.label))),
    ],
  );

  /// Shrinks a tab's label to fit narrow phones and large text sizes.
  static Widget _tabLabel(Widget child) =>
      FittedBox(fit: BoxFit.scaleDown, child: child);

  List<Widget> _matchesTab() => [
    FutureBuilder<List<AdminMatch>>(
      future: matches,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _Loading();
        }
        if (snapshot.hasError) {
          return _LoadError(
            error: snapshot.error,
            what: 'matches',
            notFound: const StatusPanel(
              message: 'Availability isn’t switched on yet.',
            ),
            onRetry: refresh,
          );
        }
        return AdminMatchesList(
          matches: snapshot.data!,
          onOpen: openMatch,
          onLineup: AppScope.of(context).auth.user?.canPickLineups ?? false
              ? openLineup
              : null,
        );
      },
    ),
  ];

  List<Widget> _peopleTab() => [
    const SectionHeading('JOIN REQUESTS'),
    FutureBuilder<List<AdminJoinRequest>>(
      future: requests,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _Loading();
        }
        if (snapshot.hasError) {
          return _LoadError(
            error: snapshot.error,
            what: 'join requests',
            notFound: const StatusPanel(
              message: 'Join requests aren’t switched on yet.',
            ),
            onRetry: refresh,
          );
        }
        final items = snapshot.data!;
        if (items.isEmpty) {
          return const StatusPanel(
            message: 'No requests waiting.',
            detail: 'New requests to join show up here.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final request in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: JoinRequestCard(
                  key: ValueKey('request-${request.id}'),
                  request: request,
                  busy: deciding.contains(request.id),
                  canSetRoles:
                      AppScope.of(context).auth.user?.isSuperAdmin ?? false,
                  onApprove: (role) =>
                      decide(request, approve: true, role: role),
                  onDeny: (reason) =>
                      decide(request, approve: false, reason: reason),
                ),
              ),
          ],
        );
      },
    ),
    const SizedBox(height: 12),
    const SizedBox(height: 12),
    SectionHeading('MEMBERS', key: membersKey),
    FutureBuilder<List<ClubMember>>(
      future: members,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _Loading();
        }
        if (snapshot.hasError) {
          return _LoadError(
            error: snapshot.error,
            what: 'members',
            notFound: const StatusPanel(
              message: 'The member list isn’t switched on yet.',
            ),
            onRetry: refresh,
          );
        }
        return AdminMembersList(members: snapshot.data!, onEdit: editName);
      },
    ),
    const SizedBox(height: 12),
    InvitePanel(
      admin: widget.admin,
      canSetRoles: AppScope.of(context).auth.user?.isSuperAdmin ?? false,
      selfEmail: AppScope.of(context).auth.user?.email,
      onChanged: () => setState(() {
        members = widget.admin.members();
      }),
    ),
  ];

  List<Widget> _duesTab() => [
    Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            key: const Key('assign-dues'),
            onPressed: assignDues,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('ASSIGN DUES'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton.icon(
            key: const Key('automatic-dues'),
            onPressed: automaticDues,
            icon: const Icon(Icons.autorenew, size: 18),
            label: const Text('AUTOMATIC'),
          ),
        ),
      ],
    ),
    const SizedBox(height: 16),
    FutureBuilder<_DuesBoard>(
      future: dues,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _Loading();
        }
        if (snapshot.hasError) {
          return _LoadError(
            error: snapshot.error,
            what: 'dues',
            notFound: const StatusPanel(
              message: 'Dues are switched off',
              detail:
                  'The club server isn’t tracking dues right now, so '
                  'there’s nothing to collect here.',
            ),
            onRetry: refresh,
          );
        }
        final board = snapshot.data!;
        if (board.groups.isEmpty) {
          return const StatusPanel(
            message: 'No dues assigned yet.',
            detail: 'Tap Assign dues to give them to one player or everyone.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final group in board.groups)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DuesGroupCard(
                  group: group,
                  label: board.label,
                  expanded: expanded.contains(group.key),
                  onToggle: () => setState(() {
                    if (!expanded.remove(group.key)) {
                      expanded.add(group.key);
                    }
                  }),
                  onOpen: (item) => open(
                    item,
                    board.label(item.playerSubject),
                    group.description,
                  ),
                ),
              ),
          ],
        );
      },
    ),
  ];
}

/// One overview tile: a grey label and its value. [alert] (pink) when it
/// needs attention. Tapping switches to the tab it summarises.
class AdminTile extends StatelessWidget {
  const AdminTile({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
    this.alert = false,
    this.detail,
  });

  final String label, value;

  /// A smaller line under the value, e.g. "1 can play · 27 no reply".
  final String? detail;
  final bool alert;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: detail == null ? '$label: $value' : '$label: $value, $detail',
      excludeSemantics: true,
      child: Material(
        color: alert ? Brand.pinkTint : Brand.background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: alert ? Brand.pink : Brand.divider),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: textTheme.labelSmall),
                const SizedBox(height: 4),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontFeatures: tabularFigures,
                  ),
                ),
                if (detail != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    detail!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(24),
    child: Center(child: CircularProgressIndicator()),
  );
}

/// A failed load: [notFound] for a 404 (the feature is off; nothing to
/// retry), otherwise a message with Retry.
class _LoadError extends StatelessWidget {
  const _LoadError({
    required this.error,
    required this.what,
    required this.notFound,
    required this.onRetry,
  });

  final Object? error;
  final String what;
  final Widget notFound;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final error = this.error;
    if (error is ApiException && error.statusCode == 404) return notFound;
    if (error is ApiException && error.statusCode == 403) {
      return StatusPanel(message: 'Only club admins can see $what.');
    }
    return StatusPanel(
      message: 'Couldn’t load $what.',
      detail: 'Check your connection and try again.',
      action: FilledButton(onPressed: onRetry, child: const Text('RETRY')),
    );
  }
}

/// One dues description across the club: progress, money, and (open) who
/// is in each status. Tapping a player opens their dues and payment history.
class DuesGroupCard extends StatelessWidget {
  const DuesGroupCard({
    super.key,
    required this.group,
    required this.label,
    required this.expanded,
    required this.onToggle,
    required this.onOpen,
  });

  final DuesGroup group;
  final String Function(String subject) label;
  final bool expanded;
  final VoidCallback onToggle;
  final void Function(DuesAssessment item) onOpen;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final numbers = textTheme.bodySmall?.copyWith(fontFeatures: tabularFigures);
    List<DuesAssessment> sorted(List<DuesAssessment> items) => [...items]
      ..sort(
        (a, b) =>
            label(a.playerSubject)
                .toLowerCase()
                .compareTo(label(b.playerSubject).toLowerCase()),
      );
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: expanded,
            onTapHint: expanded ? 'hide players' : 'show players',
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            group.title,
                            style: textTheme.titleMedium,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ExcludeSemantics(
                          child: Icon(
                            expanded ? Icons.expand_less : Icons.expand_more,
                            color: Brand.secondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    DuesProgressBar(group: group),
                    const SizedBox(height: 10),
                    Text(
                      group.progressLine,
                      style: textTheme.bodyMedium?.copyWith(
                        fontFeatures: tabularFigures,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(group.moneyLine, style: numbers),
                  ],
                ),
              ),
            ),
          ),
          if (expanded) ...[
            const Divider(height: 1),
            for (final (title, items) in [
              ('Unpaid', sorted(group.unpaid)),
              ('Partly paid', sorted(group.partial)),
              ('Waived', sorted(group.waived)),
              ('Volunteered', sorted(group.volunteered)),
              ('Paid in full', sorted(group.paid)),
            ])
              if (items.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                  child: Semantics(
                    header: true,
                    child: Eyebrow('$title (${items.length})'),
                  ),
                ),
                for (final item in items)
                  _PlayerDuesRow(
                    dues: item,
                    label: label(item.playerSubject),
                    onOpen: () => onOpen(item),
                  ),
              ],
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

/// Blue for the share paid in full, light pink for partly paid, grey for
/// the rest, by balance (volunteer and waived credit count as paid). The
/// counts, and money vs credit, are read out by the text beneath it.
class DuesProgressBar extends StatelessWidget {
  const DuesProgressBar({super.key, required this.group});
  final DuesGroup group;

  @override
  Widget build(BuildContext context) {
    final rest =
        group.count -
        group.paid.length -
        group.waived.length -
        group.volunteered.length -
        group.partial.length;
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: SizedBox(
          height: 8,
          child: Row(
            children: [
              if (group.paid.isNotEmpty)
                Expanded(
                  flex: group.paid.length,
                  child: const ColoredBox(color: Brand.blue),
                ),
              if (group.waived.isNotEmpty || group.volunteered.isNotEmpty)
                Expanded(
                  flex: group.waived.length + group.volunteered.length,
                  child: ColoredBox(color: Brand.blue.withValues(alpha: 0.35)),
                ),
              if (group.partial.isNotEmpty)
                Expanded(
                  flex: group.partial.length,
                  child: const ColoredBox(color: Brand.pinkBorder),
                ),
              if (rest > 0)
                Expanded(
                  flex: rest,
                  child: const ColoredBox(color: Brand.divider),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlayerDuesRow extends StatelessWidget {
  const _PlayerDuesRow({
    required this.dues,
    required this.label,
    required this.onOpen,
  });

  final DuesAssessment dues;
  final String label;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final owes = dues.balanceCents > 0;
    final detail = [
      if (dues.paidCents > 0 && owes)
        'Paid ${formatCents(dues.paidCents)} of '
            '${formatCents(dues.amountCents)}',
      if (dues.creditedCents > 0)
        '${formatCents(dues.creditedCents)} ${dues.creditLabel.toLowerCase()}',
      if (dues.hasPendingCheckout)
        'Card checkout ${formatCents(dues.pendingCheckoutCents)} in progress',
    ].join(' · ');
    return Semantics(
      button: true,
      onTapHint: 'see payments',
      child: InkWell(
        onTap: onOpen,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: textTheme.bodyLarge),
                      if (detail.isNotEmpty)
                        Text(
                          detail,
                          style: textTheme.bodySmall?.copyWith(
                            fontFeatures: tabularFigures,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (owes) ...[
                  Text(
                    'Owes ${formatCents(dues.balanceCents)}',
                    style: textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: tabularFigures,
                    ),
                  ),
                ] else
                  FixtureBadge(
                    label: dues.settledByCredit
                        ? dues.creditLabel.toUpperCase()
                        : 'PAID',
                  ),
                const ExcludeSemantics(
                  child: Icon(Icons.chevron_right, color: Brand.secondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
