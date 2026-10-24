import 'package:flutter_test/flutter_test.dart';
import 'package:netfly/core/format.dart';

void main() {
  test('prices read as on the web', () {
    expect(priceLabel(priceTzs: 0, periodDays: 30, isFree: true), 'Free');
    expect(priceLabel(priceTzs: 2500, periodDays: 30, isFree: false), 'TSh 2,500/month');
    expect(priceLabel(priceTzs: 1000, periodDays: 7, isFree: false), 'TSh 1,000/week');
    expect(priceLabel(priceTzs: 9000, periodDays: 90, isFree: false), 'TSh 9,000/90 days');
  });

  test('viewing limits', () {
    expect(limitPhrase(null, 'day'), 'Unlimited');
    expect(limitPhrase(60, 'day'), '1 hour a day');
    expect(limitPhrase(240, 'day'), '4 hours a day');
    expect(limitPhrase(90, 'week'), '1h 30m a week');
    expect(limitPhrase(45, 'day'), '45 minutes a day');
  });

  test('clock', () {
    expect(clock(const Duration(seconds: 5)), '0:05');
    expect(clock(const Duration(minutes: 4, seconds: 5)), '4:05');
    expect(clock(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
  });

  test('plan gradients are stable per position', () {
    expect(planGradient(1).colors, planGradient(5).colors);
    expect(planGradient(0).colors, isNot(planGradient(1).colors));
  });
}
