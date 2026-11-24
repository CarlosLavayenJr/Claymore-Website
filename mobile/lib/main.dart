import 'package:flutter/foundation.dart' show defaultTargetPlatform;
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'club_data.dart';
import 'club_time.dart';
import 'notifications.dart';

const blue = Color(0xff77c3ef);
const pink = Color(0xfffd80b5);
const ink = Color(0xff111111);
const divider = Color(0xffeaeaea);
const duesEnabled = bool.fromEnvironment('ENABLE_DUES');

enum Availability {
  available('Available'),
  unsure('Unsure'),
  unavailable('Unavailable');

  const Availability(this.label);
  final String label;
}

void main() => runApp(const ClaymoresApp());

class ClaymoresApp extends StatelessWidget {
  const ClaymoresApp({super.key, this.repository = const ClubRepository()});
  final ClubRepository repository;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Claymores RFC',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white,
        colorScheme: ColorScheme.fromSeed(seedColor: blue).copyWith(
          primary: blue,
          onPrimary: ink,
          surface: Colors.white,
          onSurface: ink,
          secondaryContainer: const Color(0xffdef1fc),
          outlineVariant: divider,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Colors.white,
          indicatorColor: Color(0xffdef1fc),
        ),
      ),
      home: ClubShell(repository: repository),
    );
  }
}

class ClubShell extends StatefulWidget {
  const ClubShell({super.key, required this.repository});
  final ClubRepository repository;

  @override
  State<ClubShell> createState() => _ClubShellState();
}

class _ClubShellState extends State<ClubShell> {
  final prefs = SharedPreferencesAsync();
  final notifications = const ClubNotifications();
  late Future<ClubData> data = widget.repository.load();
  int tab = 0;
  bool playerPreview = false;
  bool history = false;
  int? season;

  Future<void> reload() async {
    final request = widget.repository.load();
    setState(() {
      data = request;
    });
    await request.then<void>((_) {}, onError: (Object _) {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/crest.png', width: 24, height: 37),
            const SizedBox(width: 12),
            const Text(
              'CLAYMORES RFC',
              style: TextStyle(fontFamily: 'Claymore'),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) {
          if (index != tab) setState(() => tab = index);
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            label: 'Fixtures',
          ),
          NavigationDestination(
            icon: Icon(Icons.shield_outlined),
            label: 'Club',
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: FutureBuilder<ClubData>(
              future: data,
              builder: (context, snapshot) {
                final reduceMotion = MediaQuery.disableAnimationsOf(context);
                return AnimatedSwitcher(
                  duration: reduceMotion
                      ? Duration.zero
                      : const Duration(milliseconds: 180),
                  switchInCurve: Curves.easeOut,
                  switchOutCurve: Curves.easeIn,
                  layoutBuilder: (current, previous) => Stack(
                    fit: StackFit.expand,
                    children: [
                      for (final outgoing in previous)
                        ExcludeSemantics(
                          key: outgoing.key,
                          child: IgnorePointer(
                            child: ExcludeFocus(child: outgoing),
                          ),
                        ),
                      ?current,
                    ],
                  ),
                  child: KeyedSubtree(
                    key: ValueKey(tab),
                    child: tab == 2 ? page(2, club()) : schedule(tab, snapshot),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget schedule(int index, AsyncSnapshot<ClubData> snapshot) {
    if (snapshot.hasError) {
      return Center(
        child: FilledButton(
          onPressed: reload,
          child: const Text('Retry loading club schedule'),
        ),
      );
    }
    if (!snapshot.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    final clubData = snapshot.data!;
    return RefreshIndicator(
      onRefresh: reload,
      child: page(index, [
        if (clubData.isSnapshot)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'Schedule snapshot · 23 Nov 2026',
              style: TextStyle(color: Color(0xff555555)),
            ),
          ),
        ...(index == 0 ? home(clubData) : fixtures(clubData)),
      ]),
    );
  }

  Widget page(int index, List<Widget> children) => ListView(
    key: PageStorageKey(index),
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
    children: children,
  );

  List<Widget> home(ClubData clubData) {
    final today = clubToday();
    final next = clubData.fixtures
        .where(
          (fixture) =>
              fixture.status == 'upcoming' && !fixture.date.isBefore(today),
        )
        .firstOrNull;
    final practice = clubData.practice;
    return [
      heading('NEXT MATCH'),
      if (next == null)
        panel(const Text('No upcoming match is listed.'))
      else
        FixtureCard(
          key: ValueKey(next.id),
          fixture: next,
          availability: playerPreview,
          prefs: prefs,
          featured: true,
        ),
      const SizedBox(height: 24),
      heading('PRACTICE'),
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${practice.weekday} · ${practice.time}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(practice.venue),
            Text(practice.address),
            const SizedBox(height: 8),
            Text(practice.note),
            DirectionsButton(venue: practice.address),
          ],
        ),
      ),
    ];
  }

  List<Widget> fixtures(ClubData clubData) {
    final today = clubToday();
    final past = clubData.fixtures
        .where((f) => f.date.isBefore(today))
        .toList();
    final seasons = past.map((f) => f.season).nonNulls.toSet().toList()
      ..sort((a, b) => b.compareTo(a));
    final selectedSeason = seasons.contains(season) ? season : null;
    final visible = history
        ? past.reversed.where(
            (f) => selectedSeason == null || f.season == selectedSeason,
          )
        : clubData.fixtures.where((f) => !f.date.isBefore(today));
    return [
      heading('FIXTURES'),
      SegmentedButton<bool>(
        segments: const [
          ButtonSegment(value: false, label: Text('Upcoming')),
          ButtonSegment(value: true, label: Text('History')),
        ],
        selected: {history},
        onSelectionChanged: (values) => setState(() => history = values.single),
      ),
      const SizedBox(height: 14),
      if (history)
        DropdownButton<int>(
          isExpanded: true,
          value: selectedSeason ?? 0,
          items: [
            const DropdownMenuItem(value: 0, child: Text('All seasons')),
            for (final year in seasons)
              DropdownMenuItem(value: year, child: Text('Season $year')),
          ],
          onChanged: (value) =>
              setState(() => season = value == 0 ? null : value),
        ),
      if (visible.isEmpty)
        panel(
          Text(
            history
                ? 'No past fixtures listed.'
                : 'No upcoming fixtures listed.',
          ),
        ),
      for (final fixture in visible)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: FixtureCard(
            key: ValueKey(fixture.id),
            fixture: fixture,
            availability:
                playerPreview && !history && fixture.status == 'upcoming',
            prefs: prefs,
          ),
        ),
    ];
  }

  List<Widget> club() => [
    heading('CLUB'),
    panel(
      SwitchListTile(
        title: const Text('Player preview'),
        subtitle: const Text(
          'Try match availability. Responses stay on this device.',
        ),
        value: playerPreview,
        contentPadding: EdgeInsets.zero,
        onChanged: (value) => setState(() => playerPreview = value),
      ),
    ),
    const SizedBox(height: 20),
    heading('NOTIFICATIONS'),
    panel(AlertSettings(notifications: notifications, prefs: prefs)),
    if (duesEnabled && playerPreview) ...[
      const SizedBox(height: 20),
      heading('PLAYER DUES'),
      panel(
        const Text('Dues preview. Payment and balance tracking are pending.'),
      ),
    ],
  ];
}

Widget heading(String title) => Padding(
  padding: const EdgeInsets.only(bottom: 10),
  child: Text(
    title,
    style: const TextStyle(fontFamily: 'Claymore', fontSize: 26),
  ),
);

Widget panel(Widget child, {bool featured = false}) => Material(
  color: Colors.white,
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(8),
    side: BorderSide(color: featured ? blue : divider),
  ),
  clipBehavior: Clip.antiAlias,
  child: Padding(padding: const EdgeInsets.all(16), child: child),
);

class FixtureCard extends StatelessWidget {
  const FixtureCard({
    super.key,
    required this.fixture,
    required this.availability,
    required this.prefs,
    this.featured = false,
  });

  final Fixture fixture;
  final bool availability, featured;
  final SharedPreferencesAsync prefs;

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final date =
        '${localizations.formatMediumDate(fixture.date)}, ${fixture.date.year}';
    void openMatch() {
      Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(
              title: const Text(
                'MATCH DETAILS',
                style: TextStyle(fontFamily: 'Claymore'),
              ),
            ),
            body: SafeArea(
              top: false,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 640),
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      Text(localizations.formatFullDate(fixture.date)),
                      const SizedBox(height: 12),
                      panel(FixtureMatchup(fixture: fixture), featured: true),
                      const SizedBox(height: 24),
                      heading('GAME INFO'),
                      panel(
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (fixture.season != null)
                              Text('Season ${fixture.season}'),
                            if (fixture.status == 'upcoming')
                              Text(
                                fixture.kickoff.isEmpty
                                    ? 'Kickoff to be announced'
                                    : 'Kickoff ${fixture.kickoff}',
                              ),
                            if (fixture.venue.isNotEmpty)
                              Text(fixture.venue)
                            else if (fixture.status == 'upcoming')
                              const Text('Venue to be announced'),
                            if (fixture.note.isNotEmpty) Text(fixture.note),
                            if (fixture.venue.isNotEmpty)
                              DirectionsButton(venue: fixture.venue),
                          ],
                        ),
                      ),
                      if (availability) ...[
                        const SizedBox(height: 12),
                        panel(
                          AvailabilityPicker(
                            fixtureId: fixture.id,
                            prefs: prefs,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          date.toUpperCase(),
          style: const TextStyle(
            color: Color(0xff555555),
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 8),
        Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
            side: BorderSide(color: featured ? blue : divider),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              Semantics(
                button: true,
                label: fixture.title,
                child: InkWell(
                  onTap: openMatch,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    child: FixtureMatchup(fixture: fixture),
                  ),
                ),
              ),
              if (availability)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  child: AvailabilityPicker(
                    fixtureId: fixture.id,
                    prefs: prefs,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class FixtureMatchup extends StatelessWidget {
  const FixtureMatchup({super.key, required this.fixture});
  final Fixture fixture;

  @override
  Widget build(BuildContext context) {
    final opponent = fixture.home.trim().toLowerCase() == 'claymores'
        ? fixture.away
        : fixture.home;
    final isUpcoming = fixture.status == 'upcoming';
    final isPlayed = fixture.status == 'played';
    return Row(
      children: [
        Expanded(
          child: FixtureTeam(name: fixture.home, logo: fixture.homeLogo),
        ),
        Expanded(
          flex: 2,
          child: Column(
            children: [
              Text(
                isPlayed ? fixture.statusLabel : 'VS ${opponent.toUpperCase()}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: isPlayed ? 'monospace' : null,
                  fontSize: isPlayed ? 16 : 12,
                  color: isPlayed ? ink : const Color(0xff23658a),
                  fontWeight: FontWeight.w700,
                  letterSpacing: isPlayed ? 0 : 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 5,
                runSpacing: 4,
                children: [
                  FixtureBadge(
                    label: isUpcoming
                        ? 'Upcoming'
                        : isPlayed
                        ? 'Final'
                        : fixture.statusLabel,
                    foreground: const Color(0xff23658a),
                    background: const Color(0xffedf7fd),
                    border: const Color(0xffb9dff5),
                  ),
                  if (fixture.matchType == 'friendly')
                    const FixtureBadge(
                      label: 'FRIENDLY',
                      foreground: Color(0xffa62663),
                      background: Color(0xfffff0f7),
                      border: Color(0xffffbfdd),
                    ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: FixtureTeam(name: fixture.away, logo: fixture.awayLogo),
        ),
      ],
    );
  }
}

class FixtureTeam extends StatelessWidget {
  const FixtureTeam({super.key, required this.name, required this.logo});
  final String name;
  final String? logo;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      FixtureLogo(url: logo, club: name),
      Text(
        name,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11),
      ),
    ],
  );
}

class FixtureBadge extends StatelessWidget {
  const FixtureBadge({
    super.key,
    required this.label,
    required this.foreground,
    required this.background,
    required this.border,
  });
  final String label;
  final Color foreground, background, border;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: background,
      border: Border.all(color: border),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Text(
      label,
      textAlign: TextAlign.center,
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: foreground,
      ),
    ),
  );
}

class FixtureLogo extends StatelessWidget {
  const FixtureLogo({super.key, required this.url, required this.club});
  final String? url;
  final String club;

  static const bundledLogos = {
    'brevard': 'brevard.png',
    'daytona': 'daytona.png',
    'ft. lauderdale': 'ft-lauderdale.png',
    'gainesville hogs': 'gainesville-hogs.png',
    'jacksonville': 'jacksonville.png',
    'lakeland': 'lakeland.png',
    'orlando otters': 'orlando-otters.png',
    'sarasota': 'sarasota.png',
    'tallahassee': 'tallahassee.png',
    'tampa': 'tampa.png',
  };

  @override
  Widget build(BuildContext context) {
    final team = club.trim().toLowerCase();
    final bundled = bundledLogos[team];
    final asset = team == 'claymores'
        ? 'assets/crest.png'
        : bundled == null
        ? null
        : 'assets/teams/$bundled';
    const fallback = Icon(Icons.shield_outlined, size: 28);
    return SizedBox.square(
      dimension: 40,
      child: Center(
        child: asset != null
            ? Image.asset(
                asset,
                width: 36,
                height: 36,
                fit: BoxFit.contain,
                excludeFromSemantics: true,
              )
            : url == null
            ? fallback
            : Image.network(
                url!,
                width: 36,
                height: 36,
                fit: BoxFit.contain,
                excludeFromSemantics: true,
                errorBuilder: (context, error, stackTrace) => fallback,
              ),
      ),
    );
  }
}

class DirectionsButton extends StatelessWidget {
  const DirectionsButton({super.key, required this.venue});
  final String venue;

  Future<void> openDirections(BuildContext context, Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } on Exception {
      // Show the same failure as an unavailable maps handler.
    }
    if (context.mounted) showMessage(context, 'Could not open directions.');
  }

  @override
  Widget build(BuildContext context) {
    final destination = switch (defaultTargetPlatform) {
      TargetPlatform.iOS || TargetPlatform.macOS => Uri.https(
        'maps.apple.com',
        '/directions',
        {'destination': venue},
      ),
      _ => Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'destination': venue,
      }),
    };

    return TextButton.icon(
      style: TextButton.styleFrom(foregroundColor: ink),
      icon: const Icon(Icons.directions_outlined),
      label: const Text('Directions'),
      onPressed: () => openDirections(context, destination),
    );
  }
}

class AvailabilityPicker extends StatefulWidget {
  const AvailabilityPicker({
    super.key,
    required this.fixtureId,
    required this.prefs,
  });
  final String fixtureId;
  final SharedPreferencesAsync prefs;

  @override
  State<AvailabilityPicker> createState() => _AvailabilityPickerState();
}

class _AvailabilityPickerState extends State<AvailabilityPicker> {
  String get preferenceKey => 'availability.${widget.fixtureId}';
  late Future<String?> response = widget.prefs.getString(preferenceKey);
  bool saving = false;

  Future<void> save(Availability value) async {
    setState(() => saving = true);
    try {
      await widget.prefs.setString(preferenceKey, value.name);
      if (mounted) {
        setState(() {
          response = Future.value(value.name);
        });
      }
    } on Exception {
      if (mounted) showMessage(context, 'Could not save availability.');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<String?>(
    future: response,
    builder: (context, snapshot) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(),
        const Text('Can you play?'),
        const Text('Player preview · saved on this device'),
        if (snapshot.hasError)
          TextButton(
            onPressed: () => setState(() {
              response = widget.prefs.getString(preferenceKey);
            }),
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
                      saving || snapshot.connectionState != ConnectionState.done
                      ? null
                      : (_) => save(value),
                ),
            ],
          ),
      ],
    ),
  );
}

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
          const Text('Push requires a configured iOS or Android build.'),
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

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}
