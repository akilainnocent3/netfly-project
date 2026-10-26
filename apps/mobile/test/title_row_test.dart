import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/api/generated/models/home_page.dart';
import 'package:netfly/widgets/title_row.dart';

import 'support/harness.dart';

void main() {
  setUpAll(() {
    // The image cache wants a directory; nothing is fetched.
    final dir = Directory.systemTemp.createTempSync('netfly-row');
    TestWidgetsFlutterBinding.ensureInitialized().defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (_) async => dir.path,
    );
  });

  final home = HomePage.fromJson(
    (jsonDecode(File('test/fixtures/browse_home.json').readAsStringSync()) as Map).cast<String, Object?>(),
  );

  // The edge cue's own Semantics widget (the semantics tree drops a cue that is switched off).
  Finder cue(String label) => find.byWidgetPredicate((w) => w is Semantics && w.properties.label == label);
  bool off(WidgetTester tester, String label) =>
      tester.widget<IgnorePointer>(find.ancestor(of: cue(label), matching: find.byType(IgnorePointer)).first).ignoring;

  group('snapping', () {
    const physics = SnapToItemPhysics(itemExtent: 200, parent: BouncingScrollPhysics());
    ScrollMetrics at(double pixels) => FixedScrollMetrics(
      minScrollExtent: 0,
      maxScrollExtent: 1000,
      pixels: pixels,
      viewportDimension: 390,
      axisDirection: AxisDirection.right,
      devicePixelRatio: 3,
    );
    double rest(double pixels, double velocity) =>
        physics.createBallisticSimulation(at(pixels), velocity)!.x(double.infinity);

    test('a short flick always moves a whole card, either way', () {
      expect(rest(30, 400), 200);
      expect(rest(370, -400), 200);
    });

    test('a slow release settles on the nearest card', () {
      expect(rest(90, 0), 0);
      expect(rest(110, 0), 200);
    });

    test('a hard fling travels further but still lands on a card, within the row', () {
      expect(rest(0, 2500) % 200, 0);
      expect(rest(0, 2500), greaterThan(400));
      expect(rest(800, 9000), 1000);
    });
  });

  testWidgets('edge chevrons show where there are more cards and page the row', (tester) async {
    final row = home.rows.firstWhere((r) => r.key == 'top_picks');
    await pumpScreen(
      tester,
      Scaffold(
        body: ListView(children: [TitleRow(row: row)]),
      ),
    );
    expect(cue('More in ${row.title}'), findsOneWidget);
    expect(off(tester, 'Back in ${row.title}'), isTrue);

    await tester.tap(cue('More in ${row.title}'));
    await tester.pumpAndSettle();
    final list = tester.state<ScrollableState>(
      find.descendant(of: find.byType(TitleRow), matching: find.byType(Scrollable)).first,
    );
    expect(list.position.pixels, greaterThan(0));
    expect(off(tester, 'Back in ${row.title}'), isFalse);
  });

  testWidgets('a row that fits on screen shows no cues', (tester) async {
    final row = home.rows.firstWhere((r) => r.items.length == 1);
    await pumpScreen(
      tester,
      Scaffold(
        body: ListView(children: [TitleRow(row: row)]),
      ),
    );
    for (final label in ['More in ${row.title}', 'Back in ${row.title}']) {
      expect(off(tester, label), isTrue);
    }
  });
}
