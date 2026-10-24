import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/features/account/playback_settings_screen.dart';

import 'support/fakes.dart';
import 'support/harness.dart';

const config = {'playback.preview_mb_per_minute': 27, 'playback.episode_mb_per_minute': 68};

SwitchListTile switchFor(WidgetTester tester, String title) =>
    tester.widget<SwitchListTile>(find.ancestor(of: find.text(title), matching: find.byType(SwitchListTile)));

void main() {
  testWidgets('turning previews on warns about mobile data, with the MB from the ladder', (tester) async {
    final server = await pumpScreen(
      tester,
      const PlaybackSettingsScreen(),
      config: config,
      user: userJson(autoplayPreviews: false),
      api: (r) => (200, userJson(autoplayPreviews: true)),
    );
    expect(switchFor(tester, 'Autoplay previews').value, isFalse);

    await tester.tap(find.text('Autoplay previews'));
    await tester.pumpAndSettle();
    expect(find.text('Turn on autoplay previews?'), findsOneWidget);
    expect(find.textContaining('uses mobile data (about 27 MB per minute of preview)'), findsOneWidget);

    // Cancel keeps it off and saves nothing.
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(switchFor(tester, 'Autoplay previews').value, isFalse);
    expect(server.to('/api/v1/auth/me'), isEmpty);

    // Turn on saves it.
    await tester.tap(find.text('Autoplay previews'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on'));
    await tester.pumpAndSettle();
    final patch = server.to('/api/v1/auth/me').single;
    expect(patch.method, 'PATCH');
    expect(patch.data, isA<Object>());
    expect(switchFor(tester, 'Autoplay previews').value, isTrue);
  });

  testWidgets('next episode warns with the episode figure', (tester) async {
    await pumpScreen(
      tester,
      const PlaybackSettingsScreen(),
      config: config,
      user: userJson(autoplayNext: false),
      api: (r) => (200, userJson()),
    );
    await tester.tap(find.text('Autoplay next episode'));
    await tester.pumpAndSettle();
    expect(find.textContaining('up to about 68 MB per minute of video'), findsOneWidget);
  });

  testWidgets('turning autoplay off needs no confirmation', (tester) async {
    final server = await pumpScreen(
      tester,
      const PlaybackSettingsScreen(),
      config: config,
      api: (r) => (200, userJson(autoplayNext: false)),
    );
    await tester.tap(find.text('Autoplay next episode'));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);
    expect(server.to('/api/v1/auth/me'), hasLength(1));
    expect(switchFor(tester, 'Autoplay next episode').value, isFalse);
  });

  testWidgets('Data saver is on by default; turning it off asks first', (tester) async {
    await pumpScreen(tester, const PlaybackSettingsScreen(), config: config);
    expect(switchFor(tester, 'Data saver: autoplay on Wi-Fi only').value, isTrue);
    await tester.tap(find.text('Data saver: autoplay on Wi-Fi only'));
    await tester.pumpAndSettle();
    expect(find.text('Autoplay on mobile data?'), findsOneWidget);
    await tester.tap(find.text('Turn off'));
    await tester.pumpAndSettle();
    expect(switchFor(tester, 'Data saver: autoplay on Wi-Fi only').value, isFalse);
  });

  testWidgets('without ladder figures the warning still shows, without a number', (tester) async {
    await pumpScreen(tester, const PlaybackSettingsScreen(), user: userJson(autoplayPreviews: false));
    await tester.tap(find.text('Autoplay previews'));
    await tester.pumpAndSettle();
    expect(find.text('Autoplay plays video automatically and uses mobile data. Turn on?'), findsOneWidget);
  });
}
