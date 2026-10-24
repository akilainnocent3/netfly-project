import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/badge_enum.dart';
import '../../api/generated/models/billboard_item.dart';
import '../../core/theme.dart';
import '../../data/engagement.dart';
import '../../widgets/badge.dart';
import '../../widgets/buttons.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/preview_player.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/title_card.dart';

/// Phones: a centred 2:3 poster card over the blurred artwork, with its buttons at the bottom
/// (the web's `PosterHero`, decision 52 "Home on phones"). A muted trailer plays in the card
/// when the viewer's autoplay settings allow it.
class PosterHero extends ConsumerWidget {
  const PosterHero({super.key, required this.item, required this.scroll});

  final BillboardItem item;

  /// Pixels scrolled: gentle parallax and fade.
  final double scroll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final title = item.title;
    final engagement = ref.watch(engagementProvider.notifier);
    ref.watch(engagementProvider);
    final inList = engagement.inMyList(title.id, title.inMyList ?? false);
    final ribbon = title.badge != null && title.badge != BadgeEnum.top10 ? title.badge : null;
    final top = MediaQuery.paddingOf(context).top + 104; // under the header + chips
    final width = MediaQuery.sizeOf(context).width;
    final cardWidth = (width - NetflySpace.gutter * 2).clamp(0.0, 420.0);
    final fade = (1 - scroll / 500).clamp(0.0, 1.0);

    return Stack(
      children: [
        // Blurred artwork behind the card (fixed, so the card slides over it).
        Positioned.fill(
          child: Transform.translate(
            offset: Offset(0, scroll * 0.5),
            child: Opacity(
              opacity: fade,
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
                child: NetflyImage(image: title.backdrop ?? title.poster),
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [t.bg, t.bg.withValues(alpha: 0), Colors.black.withValues(alpha: 0.4)],
              ),
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(NetflySpace.gutter, top, NetflySpace.gutter, 8),
          child: Center(
            child: Opacity(
              opacity: (0.25 + 0.75 * fade).clamp(0.0, 1.0),
              child: Container(
                width: cardWidth,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  boxShadow: const [BoxShadow(color: Color(0xB3000000), blurRadius: 60, offset: Offset(0, 20))],
                ),
                child: AspectRatio(
                  aspectRatio: 2 / 3,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Hero(
                        tag: heroTag(title, 'hero'),
                        child: NetflyImage(
                          image: title.poster ?? title.backdrop,
                          semanticLabel: title.title,
                          fallback: const ColoredBox(color: Color(0xFF232323)),
                        ),
                      ),
                      if (item.useTrailer || title.hasPreview)
                        PreviewPlayer(title: title, delay: const Duration(milliseconds: 1800)),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment(0, 0),
                            colors: [Color(0xE6000000), Color(0x66000000), Color(0x00000000)],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: 16,
                        child: Column(
                          children: [
                            if (title.logo != null)
                              SizedBox(
                                height: 64,
                                width: cardWidth * 0.7,
                                child: NetflyImage(
                                  image: title.logo,
                                  fit: BoxFit.contain,
                                  alignment: Alignment.bottomCenter,
                                ),
                              )
                            else
                              Semantics(
                                header: true,
                                child: Text(
                                  title.title.toUpperCase(),
                                  textAlign: TextAlign.center,
                                  style: NetflyType.h1.copyWith(height: 1, color: Colors.white),
                                ),
                              ),
                            const SizedBox(height: 10),
                            if (title.top10Rank != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Top10Mark(height: 22),
                                    const SizedBox(width: 6),
                                    Text(
                                      '#${title.top10Rank} in ${title.type.json == 'series' ? 'Series' : 'Films'} Today',
                                      style: NetflyType.meta.copyWith(fontWeight: FontWeight.w700, color: Colors.white),
                                    ),
                                  ],
                                ),
                              ),
                            if (title.maturityRating != null || ribbon != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (title.maturityRating != null)
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 4),
                                        decoration: BoxDecoration(
                                          border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
                                          borderRadius: BorderRadius.circular(2),
                                        ),
                                        child: Text(
                                          title.maturityRating!,
                                          style: NetflyType.caption.copyWith(
                                            color: Colors.white.withValues(alpha: 0.85),
                                          ),
                                        ),
                                      ),
                                    if (ribbon != null) ...[const SizedBox(width: 6), Ribbon(kind: ribbon)],
                                  ],
                                ),
                              ),
                            if (title.genres.isNotEmpty)
                              Text(
                                title.genres.join(' • '),
                                textAlign: TextAlign.center,
                                style: NetflyType.meta.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                              ),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                Expanded(
                                  child: NetflyButton(
                                    label: 'Play',
                                    icon: Icons.play_arrow_rounded,
                                    variant: NetflyButtonVariant.play,
                                    expand: true,
                                    haptic: true,
                                    onPressed: () {
                                      if (!requireAccount(context, ref)) return;
                                      final episode = title.context?.episodeId;
                                      context.push('/watch/${title.slug}${episode == null ? '' : '?episode=$episode'}');
                                    },
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: NetflyButton(
                                    label: 'My List',
                                    icon: inList ? Icons.check_rounded : Icons.add_rounded,
                                    variant: NetflyButtonVariant.secondary,
                                    expand: true,
                                    haptic: true,
                                    semanticLabel: inList ? 'Remove from My List' : 'Add to My List',
                                    onPressed: () {
                                      if (!requireAccount(context, ref)) return null;
                                      return engage(context, () => engagement.setMyList(title.id, !inList));
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class HeroSkeleton extends StatelessWidget {
  const HeroSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top + 104;
    final width = (MediaQuery.sizeOf(context).width - NetflySpace.gutter * 2).clamp(0.0, 420.0);
    return Padding(
      padding: EdgeInsets.fromLTRB(NetflySpace.gutter, top, NetflySpace.gutter, 8),
      child: Center(
        child: Skeleton(width: width, aspectRatio: 2 / 3, radius: 8),
      ),
    );
  }
}
