import 'package:claymores/club_data.dart';
import 'package:claymores/club_time.dart';
import 'package:claymores/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class TestClubRepository extends ClubRepository {
  @override
  Future<ClubData> load() async => ClubData('''
  {"result":{"matches":[
    {"_id":"previous","date":"2025-01-11","season":2025,"homeTeam":"Claymores",
     "awayTeam":"Lakeland","status":"played","homeScore":31,"awayScore":5},
    {"_id":"next","date":"2099-02-07","season":2099,"homeTeam":"Claymores",
     "awayTeam":"Daytona","status":"upcoming"}
  ],"practice":null}}
  ''', isSnapshot: false);
}

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test('Club dates roll over at Orlando midnight in winter and summer', () {
    expect(clubToday(DateTime.utc(2026, 1, 2, 4, 59)), DateTime(2026, 1, 1));
    expect(clubToday(DateTime.utc(2026, 1, 2, 5)), DateTime(2026, 1, 2));
    expect(clubToday(DateTime.utc(2026, 7, 2, 4)), DateTime(2026, 7, 2));
  });

  testWidgets('Supporters can see the next fixture and historical results', (
    tester,
  ) async {
    await tester.pumpWidget(ClaymoresApp(repository: TestClubRepository()));
    await tester.pumpAndSettle();
    expect(find.text('VS DAYTONA'), findsOneWidget);
    expect(find.text('Can you play?'), findsNothing);
    await tester.tap(find.text('Fixtures'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('31–5'), findsOneWidget);
    expect(find.text('VS DAYTONA'), findsNothing);
    await tester.tap(find.text('31–5'));
    await tester.pumpAndSettle();
    expect(find.text('MATCH DETAILS'), findsOneWidget);
    expect(find.text('Season 2025'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('31–5'), findsOneWidget);
  });

  testWidgets('Player response is restored on the fixture in another tab', (
    tester,
  ) async {
    await tester.pumpWidget(ClaymoresApp(repository: TestClubRepository()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Club'));
    await tester.pumpAndSettle();
    expect(find.text('PLAYER DUES'), findsNothing);
    await tester.tap(find.text('Player preview'));
    await tester.pumpAndSettle();
    expect(
      find.text('PLAYER DUES'),
      duesEnabled ? findsOneWidget : findsNothing,
    );
    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Available'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fixtures'));
    await tester.pumpAndSettle();
    final response = tester.widget<ChoiceChip>(
      find.widgetWithText(ChoiceChip, 'Available'),
    );
    expect(response.selected, isTrue);
  });
}
