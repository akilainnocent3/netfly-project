import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

/// Plan and time formatting, ported from packages/ui/src/plans.ts so both apps say the same.

String formatTzs(int amount) => 'TSh ${NumberFormat.decimalPattern('en_US').format(amount)}';

/// "Free", "TSh 2,500/month", "TSh 9,000/90 days".
String priceLabel({required int priceTzs, required int periodDays, required bool isFree}) {
  if (isFree || priceTzs == 0) return 'Free';
  final per = switch (periodDays) {
    30 => 'month',
    7 => 'week',
    _ => '$periodDays days',
  };
  return '${formatTzs(priceTzs)}/$per';
}

/// Minutes → "4 hours a day" / "90 minutes a week" / "1h 30m a day"; null is "Unlimited".
String limitPhrase(int? minutes, String per) {
  if (minutes == null) return 'Unlimited';
  final unit = minutes % 60 == 0
      ? '${minutes ~/ 60} hour${minutes == 60 ? '' : 's'}'
      : minutes > 60
      ? '${minutes ~/ 60}h ${minutes % 60}m'
      : '$minutes minutes';
  return '$unit a $per';
}

const _planGradients = [
  [Color(0xFF2B3A8C), Color(0xFF1A1F5E)],
  [Color(0xFF3D4FC1), Color(0xFF6A2EA3)],
  [Color(0xFF6B2FB0), Color(0xFFC0245F)],
  [Color(0xFFB81D4A), Color(0xFFE50914)],
];

/// The plan card's header gradient (stable per plan position).
LinearGradient planGradient(int order) {
  final colors = _planGradients[order.abs() % _planGradients.length];
  return LinearGradient(begin: const Alignment(-0.8, -1), end: const Alignment(0.8, 1), colors: colors);
}

String longDate(DateTime d) => DateFormat.yMMMMd().format(d.toLocal());
String shortDate(DateTime d) => DateFormat.MMMd().format(d.toLocal());

/// "4:05" / "1:02:03".
String clock(Duration d) {
  final h = d.inHours, m = d.inMinutes % 60, s = d.inSeconds % 60;
  final mm = h > 0 ? m.toString().padLeft(2, '0') : '$m';
  return '${h > 0 ? '$h:' : ''}$mm:${s.toString().padLeft(2, '0')}';
}

/// A stretch of viewing time: "2 h 5 min", "42 min", "under a minute"; days once it's that long.
String spanPhrase(Duration d) {
  if (d.inMinutes < 1) return 'under a minute';
  if (d.inHours >= 48) return '${d.inDays} days';
  final h = d.inHours, m = d.inMinutes % 60;
  if (h == 0) return '$m min';
  return m == 0 ? '$h h' : '$h h $m min';
}

/// When a window resets, from the viewer's side: "at 12:00 AM", "tomorrow at 12:00 AM", "on Mon, Nov 2".
String resetPhrase(DateTime at, {DateTime? now}) {
  final local = at.toLocal(), today = (now ?? DateTime.now()).toLocal();
  final days = DateTime(
    local.year,
    local.month,
    local.day,
  ).difference(DateTime(today.year, today.month, today.day)).inDays;
  final time = DateFormat.jm().format(local);
  if (days <= 0) return 'at $time';
  if (days == 1) return 'tomorrow at $time';
  return 'on ${DateFormat.MMMEd().format(local)}';
}
