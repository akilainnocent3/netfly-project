import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:netfly/api/generated/models/subscription.dart';
import 'package:netfly/features/account/membership_screen.dart';

import 'support/harness.dart';

Map<String, Object?> membership() =>
    jsonDecode(File('test/fixtures/billing_membership.json').readAsStringSync()) as Map<String, Object?>;

/// The fixture (a free member) turned into a paid one in [status].
Map<String, Object?> paid(String status, {bool autoRenew = true}) {
  final m = membership();
  final sub = m['subscription']! as Map<String, Object?>;
  final plan = sub['plan']! as Map<String, Object?>;
  plan
    ..['name'] = 'Kawaida'
    ..['slug'] = 'kawaida'
    ..['price_tzs'] = 5000
    ..['is_free'] = false
    ..['is_default'] = false
    ..['order'] = 1;
  sub
    ..['status'] = status
    ..['auto_renew'] = autoRenew
    ..['current_period_end'] = '2026-11-30T12:00:00Z'
    ..['payment_phone_masked'] = '+255 7•• ••• 678'
    ..['grace_until'] = status == 'grace' ? '2026-12-03T12:00:00Z' : null;
  return m;
}

Subscription sub(Map<String, Object?> m) => Subscription.fromJson(m['subscription']! as Map<String, Object?>);

void main() {
  test('what happens next, per status (as the web)', () {
    expect(nextEvent(sub(membership())), 'Watch for free every day. Upgrade anytime for more viewing time.');
    expect(nextEvent(sub(paid('active'))), 'Next payment on November 30, 2026.');
    expect(
      nextEvent(sub(paid('canceled'))),
      'Auto-renew is off. Your plan ends on November 30, 2026, then you move to the free plan.',
    );
    expect(nextEvent(sub(paid('grace'))), contains('You keep your plan until December 3, 2026'));
  });

  testWidgets('a free member sees the plan, its limits and Change plan', (tester) async {
    await pumpScreen(
      tester,
      const MembershipScreen(),
      api: (r) => r.path == '/api/v1/billing/membership' ? (200, membership()) : (404, null),
    );
    expect(find.text('Bure'), findsOneWidget);
    expect(find.text('FREE PLAN'), findsOneWidget);
    expect(find.text('1 hour a day'), findsOneWidget);
    expect(find.text('Change plan'), findsOneWidget);
    expect(find.text('Cancel auto-renew'), findsNothing);
    expect(find.text('Renew now'), findsNothing);
  });

  testWidgets('turning auto-renew off asks first, then saves', (tester) async {
    final server = await pumpScreen(
      tester,
      const MembershipScreen(),
      api: (r) => switch (r.path) {
        '/api/v1/billing/membership' => (200, paid('active')),
        '/api/v1/billing/auto-renew' => (200, paid('canceled', autoRenew: false)['subscription']),
        _ => (404, null),
      },
    );
    expect(find.text('Payment phone: +255 7•• ••• 678'), findsOneWidget);
    await tester.tap(find.text('Cancel auto-renew'));
    await tester.pumpAndSettle();
    expect(find.text('Turn off auto-renew?'), findsOneWidget);
    expect(server.to('/api/v1/billing/auto-renew'), isEmpty);
    await tester.tap(find.text('Turn off auto-renew').last);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(server.to('/api/v1/billing/auto-renew').single.data, {'on': false});
    expect(find.textContaining('Auto-renew is off. You keep Kawaida until'), findsOneWidget);
  });

  testWidgets('a payment due puts Renew now first', (tester) async {
    await pumpScreen(
      tester,
      const MembershipScreen(),
      api: (r) => r.path == '/api/v1/billing/membership' ? (200, paid('past_due')) : (404, null),
    );
    expect(find.text('PAYMENT DUE'), findsOneWidget);
    expect(find.text('Renew now'), findsOneWidget);
  });

  testWidgets('with the in-app checkout switched off, plans are managed on the web', (tester) async {
    await pumpScreen(
      tester,
      const MembershipScreen(),
      config: {'payments.mobile_checkout_android': false, 'payments.mobile_checkout_ios': false},
      api: (r) => r.path == '/api/v1/billing/membership' ? (200, membership()) : (404, null),
    );
    expect(find.text('Change plan'), findsNothing);
    expect(find.textContaining('managed on the NETFLY website'), findsOneWidget);
  });
}
