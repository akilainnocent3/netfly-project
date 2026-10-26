import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/features/auth/sign_up_screen.dart';

import 'support/harness.dart';

void main() {
  testWidgets('every step shows its field above the button', (tester) async {
    final server = await pumpScreen(
      tester,
      const SignUpScreen(),
      api: (r) => r.path == '/api/v1/auth/username-available'
          ? (200, {'username': r.queryParameters['username'], 'available': true, 'message': ''})
          : (404, null),
    );
    // The button stays its own height; the field is on screen (it once filled the whole page).
    final next = tester.getRect(find.text('Next'));
    expect(tester.getSize(find.byType(TextField)).height, lessThan(80));
    expect(tester.getRect(find.byType(TextField)).bottom, lessThan(next.top));

    // Name: empty is refused.
    await tester.tap(find.text('Next'));
    await tester.pump();
    expect(find.text('Please tell us your name.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Asha  Mwita');
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // Username: checked as you type, then Next goes on.
    expect(find.text('Create your username'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'asha_m');
    await tester.pump(const Duration(milliseconds: 450));
    await tester.pumpAndSettle();
    expect(server.to('/api/v1/auth/username-available'), hasLength(1));
    expect(find.text('Nice — it’s yours if you want it.'), findsOneWidget);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();

    // Password, with Back to the username.
    expect(find.text('Create a password'), findsOneWidget);
    expect(find.text('Finish'), findsOneWidget);
    await tester.tap(find.text('Finish'));
    await tester.pump();
    expect(find.text('Use at least 8 characters.'), findsOneWidget);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Create your username'), findsOneWidget);
  });
}
