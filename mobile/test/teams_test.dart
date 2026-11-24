import 'dart:convert';

import 'package:claymores/data/teams.dart';
import 'package:claymores/shared/team_logo.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  group('TeamResolver.normalize (port of the API rules)', () {
    test('strips parentheticals, club words, divisions, years and IR/', () {
      expect(
        TeamResolver.normalize('Ft. Lauderdale Knights RFC (D3)'),
        'ft lauderdale knights',
      );
      expect(TeamResolver.normalize('Orlando (D4)'), 'orlando');
      expect(TeamResolver.normalize('Jacksonville D3'), 'jacksonville');
      expect(TeamResolver.normalize('Orlando Otters 2026'), 'orlando otters');
      expect(TeamResolver.normalize('IR/Claymores'), 'claymores');
      expect(
        TeamResolver.normalize('Hilton Head Island Rugby Football Club'),
        'hilton head island',
      );
      expect(TeamResolver.normalize('Sarasota Rugby Club'), 'sarasota');
      expect(TeamResolver.normalize('Okapi F.C.'), 'okapi');
      // A lone division token is kept rather than emptying the name.
      expect(TeamResolver.normalize('D3'), 'd3');
    });
  });

  group('TeamResolver.resolve', () {
    final resolver = TeamResolver(TeamDirectory.bundledTeams);
    String? slug(String name) => resolver.resolve(name)?.slug;

    test('fixture names', () {
      expect(slug('Jacksonville D3'), 'jacksonville-rugby');
      expect(slug('Orlando (D4)'), 'orlando-griffins');
      expect(slug('Orlando Otters 2026'), 'orlando-otters');
      expect(slug('Ft. Lauderdale'), 'fort-lauderdale-rfc');
      expect(slug('FSU B'), 'tallahassee-rugby');
      expect(slug('Tampa'), 'tampa-bay-krewe');
    });

    test('standings names', () {
      expect(slug('Orlando Griffins RFC (D3)'), 'orlando-griffins');
      expect(slug('Brevard Old Red Eye RFC (D32)'), 'brevard-red-eyes');
      expect(slug('Daytona Beach Coconuts RFC'), 'daytona-coconuts');
      expect(slug('Gainesville Hogs RFC'), 'gainesville-hogs');
      expect(slug('Jacksonville RFC'), 'jacksonville-rugby');
      expect(slug('Lakeland Lancers RFC'), 'lakeland-lancers');
      expect(slug('SWFL Hammerheads RFC 2027'), 'naples-hammerheads');
      expect(slug('Tallahassee'), 'tallahassee-rugby');
    });

    test('Claymores in any form', () {
      for (final name in [
        'Claymores',
        'IR/Claymores',
        'Central Florida Claymores RFC',
        'Claymores (D3)',
      ]) {
        expect(slug(name), 'central-florida-claymores', reason: name);
      }
    });

    test('fuzzy: a unique token subset, but never across side markers', () {
      expect(slug('Lakeland Lancers Rugby Union'), 'lakeland-lancers');
      expect(slug('Lakeland Lancers B'), isNull);
      expect(slug('Lakeland Lancers Women'), isNull);
    });

    test('unknown names resolve to nothing', () {
      expect(slug('UCF'), isNull);
      expect(slug(''), isNull);
    });
  });

  group('TeamDirectory', () {
    test('upgrades to /v1/teams and keeps bundled logos by slug', () async {
      final requests = <Uri>[];
      final directory = TeamDirectory(
        apiBaseUrl: 'https://api.example.com',
        client: MockClient((request) async {
          requests.add(request.url);
          return http.Response(
            jsonEncode([
              {
                'name': 'Orlando Griffins',
                'slug': 'orlando-griffins',
                'aliases': ['Orlando D4', 'Orlando D3'],
                'logoUrl': 'https://cdn.sanity.io/images/x/production/griffin-864x1152.png',
              },
              {
                'name': 'Brand New RFC',
                'slug': 'brand-new',
                'aliases': ['Newbies'],
                'logoUrl': 'https://evil.example.com/logo.png',
              },
            ]),
            200,
          );
        }),
      );
      expect(directory.resolve('Orlando (D4)')!.logoUrl, isNull);
      var notified = 0;
      directory.addListener(() => notified++);
      await directory.load();
      await directory.load();
      expect(requests, hasLength(1));
      expect(notified, 1);
      expect(
        directory.resolve('Orlando (D4)')!.logoUrl,
        'https://cdn.sanity.io/images/x/production/griffin-864x1152.png'
        '?w=128&h=128&fit=max&fm=png',
      );
      // Non-Sanity URLs are dropped; aliases from the API resolve.
      expect(directory.resolve('Newbies')!.slug, 'brand-new');
      expect(directory.resolve('Newbies')!.logoUrl, isNull);
      // Bundled teams the API didn't return still resolve with their asset.
      expect(directory.resolve('Tampa')!.asset, 'assets/teams/tampa.png');
    });

    test('a failing API keeps the bundled list', () async {
      final directory = TeamDirectory(
        apiBaseUrl: 'https://api.example.com',
        client: MockClient((_) async => http.Response('', 503)),
      );
      await directory.load();
      expect(directory.resolve('Jacksonville D3')!.slug, 'jacksonville-rugby');
    });
  });

  group('TeamLogo', () {
    Future<void> pump(WidgetTester tester, Widget child) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Center(child: child)),
      ),
    );

    String? assetName(WidgetTester tester) {
      final image = tester.widget<Image>(find.byType(Image));
      final provider = image.image;
      return provider is AssetImage ? provider.assetName : null;
    }

    testWidgets('Claymores shows the club crest, even with a URL', (
      tester,
    ) async {
      await pump(
        tester,
        const TeamLogo(
          name: 'IR/Claymores',
          url: 'https://cdn.sanity.io/images/x/production/c.png',
        ),
      );
      expect(assetName(tester), 'assets/crest.png');
    });

    testWidgets('a known club without a logo URL uses its bundled logo', (
      tester,
    ) async {
      await pump(tester, const TeamLogo(name: 'Jacksonville D3'));
      expect(assetName(tester), 'assets/teams/jacksonville.png');
    });

    testWidgets('an unknown club gets a monogram', (tester) async {
      await pump(tester, const TeamLogo(name: 'UCF'));
      expect(find.byType(Image), findsNothing);
      expect(find.byType(TeamMonogram), findsOneWidget);
      expect(find.text('UCF'), findsOneWidget);
      expect(TeamMonogram.initials('Embry Riddle'), 'ER');
      expect(TeamMonogram.initials('Orlando Griffins RFC (D3)'), 'OG');
    });

    testWidgets('a failing network logo falls back to the bundled one', (
      tester,
    ) async {
      // flutter_test answers every HTTP request with 400.
      await pump(
        tester,
        const TeamLogo(
          name: 'Tampa',
          url: 'https://cdn.sanity.io/images/x/production/tampa.png',
        ),
      );
      final network = tester.widget<Image>(find.byType(Image).first);
      expect(network.image, isA<NetworkImage>());
      expect(
        (network.image as NetworkImage).url,
        'https://cdn.sanity.io/images/x/production/tampa.png'
        '?w=128&h=128&fit=max&fm=png',
      );
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      final shown = tester
          .widgetList<Image>(find.byType(Image))
          .map((image) => image.image)
          .whereType<AssetImage>()
          .map((asset) => asset.assetName);
      expect(shown, contains('assets/teams/tampa.png'));
    });
  });
}
