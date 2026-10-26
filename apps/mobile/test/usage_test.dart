import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:netfly/api/generated/models/usage_scope_enum.dart';
import 'package:netfly/api/generated/models/usage_snapshot.dart';
import 'package:netfly/core/format.dart';
import 'package:netfly/data/usage.dart';
import 'package:netfly/widgets/usage_ring.dart';

import 'support/harness.dart';

/// Resets a day ahead, so the ring has a window to wait on.
String _ahead(int days) => DateTime.now().add(Duration(days: days)).toUtc().toIso8601String();

/// The fixture's usage (unlimited) turned into a metered free plan: 1 h a day, 4 h a week.
Map<String, Object?> metered({int day = 1500, int week = 6000}) {
  final m = jsonDecode(File('test/fixtures/billing_membership.json').readAsStringSync()) as Map<String, Object?>;
  final u = m['usage']! as Map<String, Object?>;
  u
    ..['exempt'] = false
    ..['allowed'] = day < 3600
    ..['limit_reached'] = day >= 3600 ? 'day' : null
    ..['limits'] = {'day': 3600, 'week': 14400, 'month': null}
    ..['used'] = {'day': day, 'week': week, 'month': week}
    ..['remaining'] = {'day': (3600 - day).clamp(0, 3600), 'week': 14400 - week, 'month': null}
    ..['remaining_seconds'] = (3600 - day).clamp(0, 3600)
    ..['resets_at'] = {'day': _ahead(1), 'week': _ahead(5), 'month': _ahead(20)};
  return u;
}

void main() {
  test('the tightest window while watching', () {
    final view = usageView(UsageSnapshot.fromJson(metered()))!;
    expect(view.scope, UsageScopeEnum.day);
    expect(view.remaining, 2100);
    expect(view.fraction, closeTo(1500 / 3600, 1e-9));
    expect(view.reached, isFalse);
    expect(usageSummary(view), '35 min left today');
  });

  test('the week is tighter when less of it is left', () {
    final view = usageView(UsageSnapshot.fromJson(metered(day: 600, week: 13800)))!;
    expect(view.scope, UsageScopeEnum.week);
    expect(usageSummary(view), '10 min left this week');
  });

  test('reached: waits for the blocking window', () {
    final view = usageView(UsageSnapshot.fromJson(metered(day: 3600)))!;
    expect(view.reached, isTrue);
    expect(view.scope, UsageScopeEnum.day);
    expect(view.fraction, 1);
  });

  test('unlimited and staff are not metered', () {
    final m = jsonDecode(File('test/fixtures/billing_membership.json').readAsStringSync()) as Map<String, Object?>;
    expect(usageView(UsageSnapshot.fromJson(m['usage']! as Map<String, Object?>)), isNull);
  });

  test('reset progress runs from the moment the limit was hit', () {
    final hit = DateTime(2026, 10, 26, 20), reset = DateTime(2026, 10, 27);
    expect(resetProgress(hit, reset, hit), 0);
    expect(resetProgress(hit, reset, DateTime(2026, 10, 26, 22)), 0.5);
    expect(resetProgress(hit, reset, DateTime(2026, 10, 27, 1)), 1);
  });

  test('time spans', () {
    expect(spanPhrase(const Duration(seconds: 30)), 'under a minute');
    expect(spanPhrase(const Duration(minutes: 42)), '42 min');
    expect(spanPhrase(const Duration(minutes: 125)), '2 h 5 min');
    expect(spanPhrase(const Duration(hours: 4)), '4 h');
  });

  testWidgets('the ring reads out the time left and opens the details', (tester) async {
    await pumpScreen(
      tester,
      const Scaffold(body: Center(child: UsageRing())),
      api: (r) => r.path == '/api/v1/billing/usage' ? (200, metered()) : (404, null),
    );
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Viewing time: 35 min left today'), findsOneWidget);
    await tester.tap(find.byType(UsageRing));
    await tester.pumpAndSettle();
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('25 min of 1 h'), findsOneWidget);
    expect(find.text('This week'), findsOneWidget);
    expect(find.text('Get more viewing time'), findsOneWidget);
  });

  testWidgets('limit reached: the ring waits for the reset', (tester) async {
    await pumpScreen(
      tester,
      const Scaffold(body: Center(child: UsageRing())),
      api: (r) => r.path == '/api/v1/billing/usage' ? (200, metered(day: 3600)) : (404, null),
    );
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.hourglass_bottom_rounded), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Viewing time: Limit reached · back tomorrow at ')), findsOneWidget);
    await tester.pump(const Duration(seconds: 9)); // the hourglass turns over
    await tester.pumpAndSettle();
  });

  testWidgets('hidden without limits', (tester) async {
    final m = jsonDecode(File('test/fixtures/billing_membership.json').readAsStringSync()) as Map<String, Object?>;
    await pumpScreen(
      tester,
      const Scaffold(body: Center(child: UsageRing())),
      api: (r) => r.path == '/api/v1/billing/usage' ? (200, m['usage']) : (404, null),
    );
    await tester.pumpAndSettle();
    expect(find.byType(InkResponse), findsNothing);
  });
}
