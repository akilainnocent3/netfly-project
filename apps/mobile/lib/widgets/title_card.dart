import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/badge_enum.dart';
import '../api/generated/models/title_card.dart';
import '../api/generated/models/title_type_enum.dart';
import '../core/theme.dart';
import 'badge.dart';
import 'netfly_image.dart';

/// Hero tag shared by a card's artwork and the title sheet's header (the shared-element
/// transition from card to title).
String heroTag(TitleCard t, String row) => 'art-$row-${t.id}';

void openTitle(BuildContext context, TitleCard t, {String row = ''}) {
  unawaited(HapticFeedback.selectionClick());
  context.push('/title/${t.slug}', extra: {'hero': heroTag(t, row), 'card': t});
}

/// The 16:9 artwork with logo art (or the title as text) — the web's `CardArt`.
class CardArt extends StatelessWidget {
  const CardArt({super.key, required this.title, this.liftLogo = false, this.showText = true});

  final TitleCard title;
  final bool liftLogo;
  final bool showText;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        NetflyImage(
          image: title.backdrop ?? title.poster,
          fallback: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.4, -0.6),
                radius: 1.2,
                colors: [t.accent.withValues(alpha: 0.35), const Color(0xFF14141A)],
              ),
            ),
          ),
        ),
        if (showText) ...[
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment(0, -0.33),
                colors: [Color(0xD9000000), Color(0x4D000000), Color(0x00000000)],
                stops: [0, 0.5, 1],
              ),
            ),
          ),
          Positioned(
            left: 10,
            right: 10,
            bottom: liftLogo ? 18 : 9,
            child: Align(
              alignment: Alignment.bottomLeft,
              child: title.logo != null
                  ? FractionallySizedBox(
                      widthFactor: 0.62,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 40),
                        child: AspectRatio(
                          aspectRatio: (title.logo!.width ?? 3) / (title.logo!.height ?? 1),
                          child: NetflyImage(image: title.logo, fit: BoxFit.contain, alignment: Alignment.bottomLeft),
                        ),
                      ),
                    )
                  : Text(
                      title.title.toUpperCase(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: NetflyType.card.copyWith(
                        color: Colors.white,
                        shadows: const [Shadow(color: Color(0xCC000000), blurRadius: 6, offset: Offset(0, 2))],
                      ),
                    ),
            ),
          ),
        ],
      ],
    );
  }
}

/// A row card: 16:9 artwork, the small ribbon bottom-centre, or Continue Watching's progress.
class TitleCardView extends ConsumerWidget {
  const TitleCardView({super.key, required this.title, required this.width, this.row = '', this.onMenu});

  final TitleCard title;
  final double width;
  final String row;

  /// Continue Watching: the ⋯ menu (hide, rate, info).
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = title.context?.progress;
    final ribbon = progress == null && title.badge != null && title.badge != BadgeEnum.top10 ? title.badge : null;
    final label = [
      title.title,
      if (Ribbon.label(ribbon) != null) Ribbon.label(ribbon)!,
      if (progress != null) '${(progress * 100).round()} % watched',
      if (title.context?.label != null) title.context!.label!,
    ].join(', ');
    final card = Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => openTitle(context, title, row: row),
        onLongPress: onMenu,
        child: SizedBox(
          width: width,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(NetflySpace.radiusCard),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: heroTag(title, row),
                    child: CardArt(title: title, liftLogo: ribbon != null),
                  ),
                  if (ribbon != null)
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      child: Center(child: Ribbon(kind: ribbon, flatBottom: true)),
                    ),
                  if (title.context?.otherMode == true)
                    Positioned(
                      top: 6,
                      right: 6,
                      child: _Pill(title.translationStatus.json == 'translated' ? 'TRANSLATED' : 'ORIGINAL'),
                    ),
                  if (progress != null) ...[
                    if (title.context?.label != null)
                      Positioned(right: 8, bottom: 10, child: _Pill(title.context!.label!)),
                    Positioned(left: 0, right: 0, bottom: 0, child: _Progress(progress)),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (onMenu == null) return card;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        card,
        SizedBox(
          width: width,
          height: 36,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title.type == TitleTypeEnum.series ? (title.context?.label ?? title.title) : title.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: NetflyType.caption.copyWith(color: NetflyTheme.of(context).muted),
                ),
              ),
              Semantics(
                button: true,
                label: 'More for ${title.title}',
                child: InkResponse(
                  onTap: onMenu,
                  radius: 22,
                  child: const SizedBox(width: 36, height: 36, child: Icon(Icons.more_horiz_rounded, size: 20)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(4)),
    child: Text(
      text,
      style: NetflyType.caption.copyWith(fontWeight: FontWeight.w600, color: Colors.white),
    ),
  );
}

class _Progress extends StatelessWidget {
  const _Progress(this.value);
  final double value;

  @override
  Widget build(BuildContext context) => Container(
    height: 3,
    color: Colors.white.withValues(alpha: 0.25),
    alignment: Alignment.centerLeft,
    child: FractionallySizedBox(
      widthFactor: value.clamp(0.0, 1.0),
      child: Container(color: NetflyTheme.of(context).accent),
    ),
  );
}

/// Top 10: a big outlined numeral next to a 2:3 poster (decision 15).
class Top10CardView extends StatelessWidget {
  const Top10CardView({super.key, required this.title, required this.rank, required this.height, this.row = 'top10'});

  final TitleCard title;
  final int rank;
  final double height;
  final String row;

  @override
  Widget build(BuildContext context) {
    final posterWidth = height * 2 / 3;
    return Semantics(
      button: true,
      label: 'Number $rank, ${title.title}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => openTitle(context, title, row: row),
        child: SizedBox(
          height: height,
          width: posterWidth * (rank >= 10 ? 1.9 : 1.6),
          child: Stack(
            children: [
              Positioned(
                left: 0,
                bottom: -height * 0.08,
                child: _OutlinedNumeral('$rank', height: height * 1.1),
              ),
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                width: posterWidth,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: Hero(
                    tag: heroTag(title, row),
                    child: NetflyImage(
                      image: title.poster,
                      fallback: CardArt(title: title),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OutlinedNumeral extends StatelessWidget {
  const _OutlinedNumeral(this.text, {required this.height});
  final String text;
  final double height;

  @override
  Widget build(BuildContext context) {
    final style = NetflyType.numeral.copyWith(fontSize: height, letterSpacing: -height * 0.08);
    return Stack(
      children: [
        Text(
          text,
          style: style.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = height * 0.035
              ..color = const Color(0xFF595959),
          ),
        ),
        Text(text, style: style.copyWith(color: const Color(0xFF141414))),
      ],
    );
  }
}
