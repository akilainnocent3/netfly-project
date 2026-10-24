// The main viewer journey on a real device against a running stack:
//
//   flutter drive --profile --driver test_driver/integration_test.dart \
//     --target integration_test/app_test.dart \
//     --dart-define=NETFLY_API_URL=http://localhost:8000 \
//     --dart-define=E2E_USERNAME=<viewer> --dart-define=E2E_PASSWORD=<password> \
//     --dart-define=E2E_TITLE="Neon Tide"
//
// Sign in → home → search → title → My List add/remove → play 10 s → progress saved →
// Account → Playback (autoplay data warning) → sign out. Screenshots and frame timings are
// reported to the driver.
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/app/app.dart';
import 'package:netfly/core/http.dart';
import 'package:netfly/main.dart' as app;

const username = String.fromEnvironment('E2E_USERNAME');
const password = String.fromEnvironment('E2E_PASSWORD');
const titleName = String.fromEnvironment('E2E_TITLE', defaultValue: 'Neon Tide');

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpUntil(WidgetTester tester, Finder finder, {Duration timeout = const Duration(seconds: 30)}) async {
    final end = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (finder.evaluate().isNotEmpty) return;
    }
    await binding.convertFlutterSurfaceToImage();
    await tester.pump();
    await binding.takeScreenshot('zz-failure');
    throw TestFailure('Timed out waiting for $finder');
  }

  Future<void> settleFor(WidgetTester tester, Duration d) async {
    final end = DateTime.now().add(d);
    while (DateTime.now().isBefore(end)) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> shot(WidgetTester tester, String name) async {
    await settleFor(tester, const Duration(milliseconds: 1500));
    if (Platform.isAndroid) await binding.convertFlutterSurfaceToImage();
    await tester.pump();
    await binding.takeScreenshot(name);
  }

  testWidgets('viewer journey', (tester) async {
    expect(username, isNotEmpty, reason: 'pass --dart-define=E2E_USERNAME / E2E_PASSWORD');
    final started = DateTime.now();
    await app.main();
    await pumpUntil(tester, find.text('Get started'));
    binding.reportData = {'cold_start_to_welcome_ms': DateTime.now().difference(started).inMilliseconds};
    await shot(tester, '01-welcome');

    // Sign in.
    await tester.tap(find.text('Sign in').first);
    await pumpUntil(tester, find.text('Email, phone or username'));
    // Typing through the platform keyboard is flaky on emulators: fill the fields directly.
    tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text = username;
    tester.widget<TextField>(find.byType(TextField).at(1)).controller!.text = password;
    await shot(tester, '02-sign-in');
    final signIn = DateTime.now();
    await tester.tap(find.text('Sign in').last); // the button (the page title says it too)
    await pumpUntil(tester, find.text('New & Hot'));
    await pumpUntil(tester, find.textContaining(RegExp('Top|picks|Trending|Continue', caseSensitive: false)));
    binding.reportData!['sign_in_to_home_content_ms'] = DateTime.now().difference(signIn).inMilliseconds;
    await shot(tester, '10-home');

    // Scroll the home rows (frame timings).
    final scrollable = find.byType(Scrollable).first;
    await binding.watchPerformance(() async {
      for (var i = 0; i < 4; i++) {
        await tester.fling(scrollable, const Offset(0, -500), 1500);
        await settleFor(tester, const Duration(milliseconds: 600));
      }
      for (var i = 0; i < 4; i++) {
        await tester.fling(scrollable, const Offset(0, 500), 1500);
        await settleFor(tester, const Duration(milliseconds: 600));
      }
    }, reportKey: 'home_scroll');

    // New & Hot.
    await tester.tap(find.text('New & Hot'));
    await settleFor(tester, const Duration(seconds: 3));
    await shot(tester, '30-new-and-hot');

    // Search → title.
    await tester.tap(find.text('Search'));
    await pumpUntil(tester, find.byType(TextField));
    await shot(tester, '40-search-empty');
    final query = tester.widget<TextField>(find.byType(TextField).first);
    query.controller!.text = titleName;
    query.onChanged?.call(titleName);
    await pumpUntil(tester, find.bySemanticsLabel(RegExp(titleName)));
    await settleFor(tester, const Duration(seconds: 2));
    await shot(tester, '41-search-results');
    await tester.tap(find.bySemanticsLabel(RegExp(titleName)).first);
    await pumpUntil(tester, find.text('Rate'));
    await shot(tester, '20-title');

    // My List: add, then remove.
    await tester.tap(find.bySemanticsLabel('Add to My List'));
    await pumpUntil(tester, find.bySemanticsLabel('Remove from My List'));
    await tester.tap(find.bySemanticsLabel('Remove from My List'));
    await pumpUntil(tester, find.bySemanticsLabel('Add to My List'));

    // Play 10 s (skipping the intro clip if it shows).
    await tester.tap(find.text('Play').first);
    await settleFor(tester, const Duration(seconds: 3));
    if (find.text('Skip').evaluate().isNotEmpty) await tester.tap(find.text('Skip'));
    // 10 s of playback, or until the end screen (the demo catalog's films are a few seconds long).
    final playing = DateTime.now();
    while (DateTime.now().difference(playing) < const Duration(seconds: 10) &&
        find.text('Back to browsing').evaluate().isEmpty) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    await shot(tester, '80-player');
    if (find.text('Back to browsing').evaluate().isEmpty) {
      // Controls hide while playing: a tap shows them.
      await tester.tapAt(tester.getCenter(find.byType(Scaffold).last));
      await settleFor(tester, const Duration(milliseconds: 500));
    }
    await tester.tap(find.byTooltip('Back').first);
    await settleFor(tester, const Duration(seconds: 3));

    // Progress was saved on the server.
    final container = ProviderScope.containerOf(tester.element(find.byType(NetflyApp)));
    final page = await container
        .read(apiProvider)
        .titles
        .titleDetail(slug: titleName.toLowerCase().replaceAll(' ', '-'));
    expect(page.viewer?.play?.position ?? 0, greaterThan(3), reason: 'watch progress is saved');
    binding.reportData!['progress_saved_seconds'] = page.viewer?.play?.position;

    // Back on the title: Resume, with the progress bar.
    await pumpUntil(tester, find.byType(LinearProgressIndicator));
    await shot(tester, '22-title-resume');
    await tester.tap(find.byIcon(Icons.close_rounded).first);
    await settleFor(tester, const Duration(seconds: 1));

    // Account → Playback: turning previews on warns about mobile data. (The tab bar steps aside
    // while the search keyboard is up, like the web's: put the keyboard away first.)
    FocusManager.instance.primaryFocus?.unfocus();
    await pumpUntil(tester, find.text('Profile'));
    await tester.tap(find.text('Profile'));
    await pumpUntil(tester, find.text('Playback settings'));
    await shot(tester, '70-account');
    await tester.tap(find.text('Playback settings'));
    await pumpUntil(tester, find.text('Autoplay previews'));
    await shot(tester, '72-playback');
    await tester.tap(find.text('Autoplay previews')); // on → off: saves at once
    await settleFor(tester, const Duration(seconds: 2));
    await tester.tap(find.text('Autoplay previews')); // off → on: asks first
    await pumpUntil(tester, find.text('Turn on autoplay previews?'));
    expect(find.textContaining('uses mobile data'), findsOneWidget);
    await shot(tester, '73-playback-warning');
    await tester.tap(find.text('Turn on'));
    await settleFor(tester, const Duration(seconds: 2));
    await tester.pageBack();
    await settleFor(tester, const Duration(seconds: 1));

    // Membership.
    await tester.tap(find.text('Membership'));
    await pumpUntil(tester, find.text('Change plan'));
    await shot(tester, '71-membership');
    await tester.pageBack();
    await settleFor(tester, const Duration(seconds: 1));

    // Sign out.
    await tester.scrollUntilVisible(find.text('Sign out'), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Sign out'));
    await pumpUntil(tester, find.text('Sign out?'));
    await tester.tap(find.text('Sign out').last);
    await pumpUntil(tester, find.text('Get started'));
  });
}
