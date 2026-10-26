import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/api/generated/models/billboard_item.dart';
import 'package:netfly/features/home/hero.dart';

import 'support/harness.dart';

void main() {
  setUpAll(() {
    // The image cache wants a directory; nothing is fetched.
    final dir = Directory.systemTemp.createTempSync('netfly-hero');
    TestWidgetsFlutterBinding.ensureInitialized().defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (_) async => dir.path,
    );
  });

  testWidgets('the billboard poster fills the whole section, top edge included', (tester) async {
    final json = jsonDecode(File('test/fixtures/browse_billboard.json').readAsStringSync()) as List;
    final item = BillboardItem.fromJson((json.first as Map).cast<String, Object?>());
    await pumpScreen(
      tester,
      Scaffold(
        body: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(height: 640, child: PosterHero(item: item, scroll: 0)),
        ),
      ),
    );
    final poster = tester.getRect(find.byType(Hero));
    expect(poster, const Rect.fromLTWH(0, 0, 390, 640));
    expect(find.text('Play'), findsOneWidget);
  });
}
