import 'package:claymores/club_data.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'API fixtures keep their IDs when practice schedule is missing',
    () async {
      final client = MockClient(
        (request) async => switch (request.url.path) {
          '/v1/fixtures' => http.Response('''
          [{"id":"existing-fixture","date":"2099-02-07",
            "homeTeam":"Claymores","awayTeam":"Daytona","status":"upcoming"}]
          ''', 200),
          '/v1/practices/schedule' => http.Response('', 404),
          _ => http.Response('', 503),
        },
      );
      addTearDown(client.close);

      final data = await ClubRepository(
        apiBaseUrl: 'https://api.example.com/',
        client: client,
      ).load();

      expect(data.fixtures.single.id, 'existing-fixture');
      expect(data.practice.venue, 'Barnett Park');
      expect(data.isSnapshot, isFalse);
    },
  );

  test(
    'API practice stays live when fixtures fall back to the snapshot',
    () async {
      final client = MockClient(
        (request) async => switch (request.url.path) {
          '/v1/fixtures' => http.Response('{"invalid": true}', 200),
          '/v1/practices/schedule' => http.Response(
            '{"venueName":"API Practice Ground","weekday":"Tuesday"}',
            200,
          ),
          _ => http.Response('', 503),
        },
      );
      addTearDown(client.close);

      final data = await ClubRepository(
        apiBaseUrl: 'https://api.example.com',
        client: client,
      ).load();

      expect(data.fixtures, isNotEmpty);
      expect(data.practice.venue, 'API Practice Ground');
      expect(data.practice.weekday, 'Tuesday');
      expect(data.isSnapshot, isTrue);
    },
  );
}
