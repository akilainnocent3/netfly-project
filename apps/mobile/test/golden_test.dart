// Regression snapshots of the account screens at 390 × 844 (iPhone 13), in the brand font
// (Inter Tight, bundled). Compare by eye with design-reference/iphone13-390x844/7x-*.png; refresh
// with `flutter test --update-goldens test/golden_test.dart`.
@Tags(['golden'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/features/account/membership_screen.dart';
import 'package:netfly/features/account/playback_settings_screen.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  testWidgets('Playback settings', (tester) async {
    await pumpScreen(
      tester,
      const PlaybackSettingsScreen(),
      brandFonts: true,
      config: const {'playback.preview_mb_per_minute': 29},
      user: userJson(autoplayPreviews: false),
    );
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/72-playback.png'));
    await tester.tap(find.text('Autoplay previews'));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/73-playback-warning.png'));
  });

  testWidgets('Membership', (tester) async {
    final membership = jsonDecode(File('test/fixtures/billing_membership.json').readAsStringSync());
    await pumpScreen(
      tester,
      const MembershipScreen(),
      brandFonts: true,
      api: (r) => r.path == '/api/v1/billing/membership' ? (200, membership) : (404, null),
    );
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/71-membership.png'));
  });
}
