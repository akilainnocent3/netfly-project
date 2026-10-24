import 'package:material_ui/material_ui.dart';

import '../api/generated/models/badge_enum.dart';
import '../core/theme.dart';

/// The small ribbon (DECISIONS 52a): ≈10 px caps, 2 × 4 px padding, radius 2.
class Ribbon extends StatelessWidget {
  const Ribbon({super.key, required this.kind, this.flatBottom = false});

  final BadgeEnum kind;

  /// On a card the ribbon sits on the artwork's bottom edge.
  final bool flatBottom;

  static String? label(BadgeEnum? kind) => switch (kind) {
    BadgeEnum.recentlyAdded => 'Recently added',
    BadgeEnum.newEpisodes => 'New episodes',
    BadgeEnum.leavingSoon => 'Leaving soon',
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final text = label(kind);
    if (text == null) return const SizedBox.shrink();
    final t = NetflyTheme.of(context);
    final leaving = kind == BadgeEnum.leavingSoon;
    const r = Radius.circular(NetflySpace.radiusBadge);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: leaving ? Colors.white.withValues(alpha: 0.9) : t.accent,
        borderRadius: flatBottom ? const BorderRadius.only(topLeft: r, topRight: r) : const BorderRadius.all(r),
        boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 4, offset: Offset(0, -1))],
      ),
      child: Text(
        text.toUpperCase(),
        style: NetflyType.badge.copyWith(color: leaving ? Colors.black : t.accentFg),
        textScaler: TextScaler.noScaling, // a fixed-size ribbon; the card's label is in semantics
      ),
    );
  }
}

/// The TOP 10 mark beside a rank.
class Top10Mark extends StatelessWidget {
  const Top10Mark({super.key, this.height = 28});

  final double height;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(color: t.accent, borderRadius: BorderRadius.circular(2)),
      child: FittedBox(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'TOP',
              style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1, color: t.accentFg),
            ),
            Text(
              '10',
              style: TextStyle(fontSize: 15, height: 1, fontWeight: FontWeight.w900, color: t.accentFg),
            ),
          ],
        ),
      ),
    );
  }
}
