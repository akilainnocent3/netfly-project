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

/// Phones: the 2:3 poster fills the whole billboard edge to edge, from behind the status bar and
/// header down, with the title and buttons over its foot (decision 52 "Home on phones"). A muted
/// trailer plays over it when the viewer's autoplay settings allow it.
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
    final width = MediaQuery.sizeOf(context).width;
    final fade = (1 - scroll / 500).clamp(0.0, 1.0);

    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          // The poster fills the whole section, from behind the status bar and header down;
          // it drifts at half speed as the page scrolls (parallax) and fades out.
          Transform.translate(
            offset: Offset(0, scroll * 0.5),
            child: Opacity(
              opacity: fade,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: heroTag(title, 'hero'),
                    child: NetflyImage(
                      image: title.poster ?? title.backdrop,
                      alignment: Alignment.topCenter,
                      semanticLabel: title.title,
                      fallback: const ColoredBox(color: Color(0xFF232323)),
                    ),
                  ),
                  if (item.useTrailer || title.hasPreview)
                    PreviewPlayer(title: title, delay: const Duration(milliseconds: 1800)),
                ],
              ),
            ),
          ),
          // Dark at the top for the header, clear through the middle, into the page at the bottom.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0, 0.22, 0.5, 0.82, 1],
                colors: [
                  Colors.black.withValues(alpha: 0.55),
                  Colors.black.withValues(alpha: 0),
                  Colors.black.withValues(alpha: 0),
                  t.bg.withValues(alpha: 0.85),
                  t.bg,
                ],
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
                    width: width * 0.7,
                    child: NetflyImage(image: title.logo, fit: BoxFit.contain, alignment: Alignment.bottomCenter),
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
                              style: NetflyType.caption.copyWith(color: Colors.white.withValues(alpha: 0.85)),
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
    );
  }
}

class HeroSkeleton extends StatelessWidget {
  const HeroSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Skeleton(radius: 0);
  }
}
