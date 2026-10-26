import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/brand/netfly_loader.dart';
import 'package:netfly/widgets/buttons.dart';

import 'support/harness.dart';

double _opacity(WidgetTester tester, Finder of) =>
    tester.widget<AnimatedOpacity>(find.ancestor(of: of, matching: find.byType(AnimatedOpacity)).first).opacity;

void main() {
  testWidgets('an async press mutes the button under the logo loader, then resets it', (tester) async {
    final done = Completer<void>();
    var presses = 0;
    await pumpScreen(
      tester,
      Scaffold(
        body: Center(
          child: NetflyButton(
            label: 'Pay',
            onPressed: () {
              presses++;
              return done.future;
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('Pay'));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(NetflyLoader), findsOneWidget);
    expect(_opacity(tester, find.text('Pay')), 0); // the label is veiled under the loader
    expect(tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity).first).opacity, 0.5); // muted

    // A second tap while it waits does nothing.
    await tester.tap(find.text('Pay'), warnIfMissed: false);
    expect(presses, 1);

    done.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(NetflyLoader), findsNothing);
    expect(_opacity(tester, find.text('Pay')), 1);
    expect(tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity).first).opacity, 1);
  });
}
