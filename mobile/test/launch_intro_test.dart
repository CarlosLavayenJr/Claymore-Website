import 'package:claymores/app/launch_intro.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  Widget app({bool reduceMotion = false}) => MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(
        size: const Size(400, 800),
        disableAnimations: reduceMotion,
      ),
      child: LaunchIntro(
        child: Scaffold(
          appBar: AppBar(
            title: Image.asset(
              'assets/crest.png',
              key: appBarCrestKey,
              width: 24,
              height: 37,
            ),
          ),
          body: const Text('Home underneath'),
        ),
      ),
    ),
  );

  // The intro draws a second crest over the app; only the top bar's is left after.
  Finder crests() => find.byWidgetPredicate(
    (w) =>
        w is Image &&
        w.image is AssetImage &&
        (w.image as AssetImage).assetName == 'assets/crest.png',
  );

  testWidgets('plays over Home, then gets out of the way', (tester) async {
    await tester.pumpWidget(app());
    expect(crests(), findsNWidgets(2));
    await tester.pump(const Duration(milliseconds: 600));
    expect(crests(), findsNWidgets(2));
    await tester.pumpAndSettle();
    expect(crests(), findsOneWidget);
    expect(find.text('Home underneath'), findsOneWidget);
  });

  testWidgets('a tap skips to the end', (tester) async {
    await tester.pumpWidget(app());
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tapAt(const Offset(200, 400));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    expect(crests(), findsOneWidget);
  });

  testWidgets('Reduce Motion skips it entirely', (tester) async {
    await tester.pumpWidget(app(reduceMotion: true));
    expect(crests(), findsOneWidget);
  });
}
