import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/generated/models/badge_enum.dart';
import '../../api/generated/models/episode.dart';
import '../../api/generated/models/title_card.dart';
import '../../api/generated/models/title_page.dart';
import '../../api/generated/models/title_type_enum.dart';
import '../../brand/netfly_loader.dart';
import '../../core/env.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../data/engagement.dart';
import '../../widgets/badge.dart';
import '../../widgets/buttons.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/preview_player.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';

/// The title view as a full-screen sheet: slides up over the feed (the card's artwork flies
/// into the header — a Hero), drags down to dismiss.
class TitleSheetPage extends Page<void> {
  const TitleSheetPage({required this.slug}) : super(key: null);

  final String slug;

  @override
  Route<void> createRoute(BuildContext context) => PageRouteBuilder<void>(
    settings: this,
    opaque: false,
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 380),
    reverseTransitionDuration: const Duration(milliseconds: 260),
    pageBuilder: (context, _, _) {
      final extra = GoRouterState.of(context).extra;
      final args = extra is Map ? extra : const <String, Object?>{};
      return TitleSheet(slug: slug, heroTag: args['hero'] as String?, card: args['card'] as TitleCard?);
    },
    transitionsBuilder: (context, animation, _, child) {
      final curved = CurvedAnimation(parent: animation, curve: NetflyMotion.easeOutExpo, reverseCurve: Curves.easeIn);
      return SlideTransition(
        position: Tween(begin: const Offset(0, 0.12), end: Offset.zero).animate(curved),
        child: FadeTransition(opacity: curved, child: child),
      );
    },
  );
}

class TitleSheet extends ConsumerStatefulWidget {
  const TitleSheet({super.key, required this.slug, this.heroTag, this.card});

  final String slug;
  final String? heroTag;

  /// The card that was tapped: shown at once while the full title loads (no blank sheet).
  final TitleCard? card;

  @override
  ConsumerState<TitleSheet> createState() => _TitleSheetState();
}

class _TitleSheetState extends ConsumerState<TitleSheet> {
  double _drag = 0;
  final _scroll = ScrollController();

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/home');
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final page = ref.watch(titleProvider(widget.slug));
    final top = MediaQuery.paddingOf(context).top;
    return GestureDetector(
      // Drag down from the top of the sheet to dismiss.
      onVerticalDragUpdate: (d) {
        if (_scroll.hasClients && _scroll.offset > 0) return;
        setState(() => _drag = (_drag + d.delta.dy).clamp(0, 400));
      },
      onVerticalDragEnd: (d) {
        if (_drag > 120 || (d.primaryVelocity ?? 0) > 900) {
          unawaited(HapticFeedback.lightImpact());
          _close();
        } else {
          setState(() => _drag = 0);
        }
      },
      child: AnimatedContainer(
        duration: _drag == 0 ? NetflyMotion.base : Duration.zero,
        curve: NetflyMotion.easeOutExpo,
        transform: Matrix4.translationValues(0, _drag, 0),
        margin: EdgeInsets.only(top: top + 8),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
        ),
        child: Material(
          color: t.surface,
          child: Stack(
            children: [
              // Keeps the page while it refreshes (after playing: Resume and the progress bar).
              if (page.value case final value?)
                _TitleBody(page: value, heroTag: widget.heroTag, scroll: _scroll)
              else if (page.hasError)
                StateMessage.error(page.error!, onRetry: () => ref.invalidate(titleProvider(widget.slug)))
              else
                _TitleLoading(card: widget.card, heroTag: widget.heroTag),
              Positioned(
                top: 8,
                right: 8,
                child: CircleIconButton(icon: Icons.close_rounded, label: 'Close', size: 36, onPressed: _close),
              ),
              Positioned(
                top: 6,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(color: Colors.white38, borderRadius: BorderRadius.circular(2)),
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

class _TitleLoading extends StatelessWidget {
  const _TitleLoading({this.card, this.heroTag});

  final TitleCard? card;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final header = card == null
        ? const Skeleton(aspectRatio: 16 / 9, radius: 0)
        : AspectRatio(
            aspectRatio: 16 / 9,
            child: CardArt(title: card!, showText: false),
          );
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      children: [
        heroTag == null ? header : Hero(tag: heroTag!, child: header),
        const Padding(
          padding: EdgeInsets.all(NetflySpace.gutter),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Skeleton(width: 220, height: 28, radius: 4),
              SizedBox(height: 12),
              Skeleton(width: 160, height: 14, radius: 4),
              SizedBox(height: 18),
              Skeleton(height: 44, radius: 4),
              SizedBox(height: 18),
              Center(child: NetflyLoader()),
            ],
          ),
        ),
      ],
    );
  }
}

class _TitleBody extends ConsumerStatefulWidget {
  const _TitleBody({required this.page, required this.scroll, this.heroTag});

  final TitlePage page;
  final ScrollController scroll;
  final String? heroTag;

  @override
  ConsumerState<_TitleBody> createState() => _TitleBodyState();
}

class _TitleBodyState extends ConsumerState<_TitleBody> {
  late int _season = widget.page.viewer?.lastSeason ?? widget.page.title.seasons.firstOrNull?.number ?? 1;
  int _tab = 0; // 0 episodes (series) / more like this

  TitleCard get _card {
    final d = widget.page.title;
    return TitleCard(
      id: d.id,
      slug: d.slug,
      title: d.title,
      type: d.type,
      seasonCount: d.seasonCount,
      translationStatus: d.translationStatus,
      poster: d.poster,
      backdrop: d.backdrop,
      logo: d.logo,
      genres: d.genres,
      hasPreview: d.hasPreview,
      match: d.match,
      context: d.context,
      inMyList: d.inMyList,
      rating: d.rating,
      badge: d.badge,
      top10Rank: d.top10Rank,
      moods: d.moods,
      year: d.year,
      maturityRating: d.maturityRating,
      runtimeMinutes: d.runtimeMinutes,
      shortSynopsis: d.shortSynopsis,
    );
  }

  Future<void> _play({int? episode}) async {
    if (!requireAccount(context, ref)) return;
    final target = episode ?? widget.page.viewer?.play?.episodeId;
    await context.push('/watch/${widget.page.title.slug}${target == null ? '' : '?episode=$target'}');
    // Back from the player: Resume, the progress bar and Continue Watching reflect what was watched.
    ref
      ..invalidate(titleProvider(widget.page.title.slug))
      ..invalidate(homeFeedProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final d = widget.page.title;
    final viewer = widget.page.viewer;
    final engagement = ref.watch(engagementProvider.notifier);
    ref.watch(engagementProvider);
    final inList = engagement.inMyList(d.id, viewer?.inMyList ?? d.inMyList ?? false);
    final rating = engagement.rating(d.id, viewer?.rating ?? d.rating);
    final series = d.type == TitleTypeEnum.series;
    final play = viewer?.play;
    final ribbon = d.badge != null && d.badge != BadgeEnum.top10 ? d.badge : null;
    final header = AspectRatio(
      aspectRatio: 16 / 9,
      child: Stack(
        fit: StackFit.expand,
        children: [
          CardArt(title: _card, showText: false),
          if (d.hasPreview) PreviewPlayer(title: _card, delay: const Duration(milliseconds: 700)),
        ],
      ),
    );

    return CustomScrollView(
      controller: widget.scroll,
      slivers: [
        SliverToBoxAdapter(
          child: widget.heroTag == null ? header : Hero(tag: widget.heroTag!, child: header),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 14, NetflySpace.gutter, 0),
          sliver: SliverList.list(
            children: [
              if (d.logo != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(
                    height: 56,
                    width: 220,
                    child: NetflyImage(
                      image: d.logo,
                      fit: BoxFit.contain,
                      alignment: Alignment.centerLeft,
                      semanticLabel: d.title,
                    ),
                  ),
                )
              else
                Semantics(
                  header: true,
                  child: Text(d.title, style: NetflyType.h1.copyWith(color: t.text)),
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (d.match != null)
                    Text(
                      '${d.match}% match',
                      style: NetflyType.meta.copyWith(color: t.match, fontWeight: FontWeight.w700),
                    ),
                  if (d.year != null) Text('${d.year}', style: NetflyType.meta.copyWith(color: t.muted)),
                  if (d.maturityRating != null) _Outline(d.maturityRating!),
                  Text(
                    series
                        ? '${d.seasonCount ?? d.seasons.length} season${(d.seasonCount ?? d.seasons.length) == 1 ? '' : 's'}'
                        : _runtime(d.runtimeMinutes),
                    style: NetflyType.meta.copyWith(color: t.muted),
                  ),
                  if (d.quality != null) _Outline(d.quality!.json ?? 'HD'),
                  if (ribbon != null) Ribbon(kind: ribbon),
                ],
              ),
              if (d.top10Rank != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Top10Mark(height: 24),
                    const SizedBox(width: 8),
                    Text(
                      '#${d.top10Rank} in ${series ? 'Series' : 'Films'} Today',
                      style: NetflyType.body.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              NetflyButton(
                label: play?.label ?? 'Play',
                icon: Icons.play_arrow_rounded,
                variant: NetflyButtonVariant.play,
                expand: true,
                haptic: true,
                onPressed: () => unawaited(_play()),
              ),
              if (play != null && play.progress > 0) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    value: play.progress,
                    minHeight: 3,
                    color: t.accent,
                    backgroundColor: Colors.white24,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              if ((d.synopsis ?? d.shortSynopsis) != null)
                Text(d.synopsis ?? d.shortSynopsis!, style: NetflyType.body.copyWith(color: t.text)),
              if (d.cast?.isNotEmpty ?? false) ...[
                const SizedBox(height: 8),
                Text(
                  'Cast: ${d.cast!.take(4).join(', ')}${d.cast!.length > 4 ? ', more' : ''}',
                  style: NetflyType.meta.copyWith(color: t.muted),
                ),
              ],
              if (d.directors?.isNotEmpty ?? false)
                Text('Director: ${d.directors!.join(', ')}', style: NetflyType.meta.copyWith(color: t.muted)),
              if (d.translatorName != null && d.translationStatus.json == 'translated')
                Text('Translated by ${d.translatorName}', style: NetflyType.meta.copyWith(color: t.subtle)),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _Action(
                    icon: inList ? Icons.check_rounded : Icons.add_rounded,
                    label: 'My List',
                    semantic: inList ? 'Remove from My List' : 'Add to My List',
                    onTap: () {
                      if (requireAccount(context, ref)) engage(context, () => engagement.setMyList(d.id, !inList));
                    },
                  ),
                  _Action(
                    icon: switch (rating) {
                      2 => Icons.thumbs_up_down_rounded,
                      1 => Icons.thumb_up_alt_rounded,
                      -1 => Icons.thumb_down_alt_rounded,
                      _ => Icons.thumb_up_alt_outlined,
                    },
                    label: 'Rate',
                    onTap: () {
                      if (requireAccount(context, ref)) _rate(context, d.id, rating);
                    },
                  ),
                  _Action(
                    icon: Icons.share_outlined,
                    label: 'Share',
                    onTap: () => SharePlus.instance.share(
                      ShareParams(text: '${d.title} on NETFLY\n${Env.webUrl}/title/${d.slug}'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (series) _TabLabel('Episodes', selected: _tab == 0, onTap: () => setState(() => _tab = 0)),
                  _TabLabel('More Like This', selected: !series || _tab == 1, onTap: () => setState(() => _tab = 1)),
                ],
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
        if (series && _tab == 0)
          _Episodes(
            slug: d.slug,
            seasons: d.seasons.map((s) => (s.number, s.displayName)).toList(),
            season: _season,
            onSeason: (s) => setState(() => _season = s),
            onPlay: (e) => _play(episode: e.id),
          )
        else
          _MoreLikeThis(items: widget.page.moreLikeThis),
        const SliverToBoxAdapter(child: SizedBox(height: 48)),
      ],
    );
  }

  static String _runtime(int? minutes) {
    if (minutes == null) return '';
    final h = minutes ~/ 60, m = minutes % 60;
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }

  Future<void> _rate(BuildContext context, int id, int? current) async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (final (value, icon, label) in const [
                (-1, Icons.thumb_down_alt_outlined, 'Not for me'),
                (1, Icons.thumb_up_alt_outlined, 'I like this'),
                (2, Icons.thumbs_up_down_outlined, 'Love this!'),
              ])
                _Action(
                  icon: icon,
                  label: label,
                  selected: current == value,
                  onTap: () => Navigator.pop(sheet, value == current ? 0 : value),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !context.mounted) return;
    await engage(context, () => ref.read(engagementProvider.notifier).rate(id, picked == 0 ? null : picked));
  }
}

class _Outline extends StatelessWidget {
  const _Outline(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
    decoration: BoxDecoration(
      border: Border.all(color: Colors.white38),
      borderRadius: BorderRadius.circular(2),
    ),
    child: Text(
      text,
      style: NetflyType.caption.copyWith(color: Colors.white70, fontWeight: FontWeight.w600),
    ),
  );
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap, this.semantic, this.selected = false});

  final IconData icon;
  final String label;
  final String? semantic;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: semantic ?? label,
    excludeSemantics: true,
    child: InkResponse(
      onTap: () {
        unawaited(HapticFeedback.lightImpact());
        onTap();
      },
      radius: 40,
      child: SizedBox(
        width: 88,
        height: 64,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 26, color: selected ? NetflyTheme.of(context).accent : Colors.white),
            const SizedBox(height: 4),
            Text(label, style: NetflyType.caption.copyWith(color: NetflyTheme.of(context).muted)),
          ],
        ),
      ),
    ),
  );
}

class _TabLabel extends StatelessWidget {
  const _TabLabel(this.label, {required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: true,
    child: InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
        margin: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: selected ? NetflyTheme.of(context).accent : Colors.transparent, width: 3),
          ),
        ),
        child: Text(
          label,
          style: NetflyType.body.copyWith(
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : NetflyTheme.of(context).muted,
          ),
        ),
      ),
    ),
  );
}

class _Episodes extends ConsumerWidget {
  const _Episodes({
    required this.slug,
    required this.seasons,
    required this.season,
    required this.onSeason,
    required this.onPlay,
  });

  final String slug;
  final List<(int, String)> seasons;
  final int season;
  final ValueChanged<int> onSeason;
  final ValueChanged<Episode> onPlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final episodes = ref.watch(episodesProvider((slug, season)));
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
      sliver: SliverList.list(
        children: [
          if (seasons.length > 1)
            Align(
              alignment: Alignment.centerLeft,
              child: PopupMenuButton<int>(
                tooltip: 'Choose a season',
                initialValue: season,
                onSelected: onSeason,
                itemBuilder: (_) => [for (final (n, name) in seasons) PopupMenuItem(value: n, child: Text(name))],
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: t.elevated, borderRadius: BorderRadius.circular(4)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        seasons.firstWhere((s) => s.$1 == season, orElse: () => seasons.first).$2,
                        style: NetflyType.body.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const Icon(Icons.keyboard_arrow_down_rounded),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 8),
          ...switch (episodes) {
            AsyncData(:final value) => [for (final e in value) _EpisodeTile(episode: e, onPlay: () => onPlay(e))],
            AsyncError(:final error) => [
              StateMessage.error(error, onRetry: () => ref.invalidate(episodesProvider((slug, season)))),
            ],
            _ => [
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: NetflyLoader(label: 'Loading episodes…')),
              ),
            ],
          },
        ],
      ),
    );
  }
}

class _EpisodeTile extends StatelessWidget {
  const _EpisodeTile({required this.episode, required this.onPlay});

  final Episode episode;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Semantics(
      button: true,
      label: 'Episode ${episode.number}, ${episode.name}${episode.watched ? ', watched' : ''}',
      excludeSemantics: true,
      child: InkWell(
        onTap: episode.available ? onPlay : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SizedBox(
                    width: 124,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: AspectRatio(
                        aspectRatio: 16 / 9,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            NetflyImage(
                              image: episode.thumbnail,
                              fallback: ColoredBox(color: t.elevated),
                            ),
                            const Center(child: Icon(Icons.play_circle_outline_rounded, size: 32, color: Colors.white)),
                            if (episode.progress > 0)
                              Align(
                                alignment: Alignment.bottomLeft,
                                child: FractionallySizedBox(
                                  widthFactor: episode.progress.clamp(0, 1),
                                  child: Container(height: 3, color: t.accent),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${episode.number}. ${episode.name}',
                          style: NetflyType.body.copyWith(fontWeight: FontWeight.w600),
                        ),
                        if (episode.runtimeMinutes != null)
                          Text('${episode.runtimeMinutes}m', style: NetflyType.meta.copyWith(color: t.muted)),
                      ],
                    ),
                  ),
                ],
              ),
              if (episode.synopsis != null) ...[
                const SizedBox(height: 6),
                Text(
                  episode.synopsis!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: NetflyType.meta.copyWith(color: t.muted),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MoreLikeThis extends StatelessWidget {
  const _MoreLikeThis({required this.items});
  final List<TitleCard> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SliverToBoxAdapter(
        child: StateMessage(title: 'Nothing similar yet', icon: Icons.movie_filter_outlined),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
      sliver: SliverGrid.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 2 / 3,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: items.length,
        itemBuilder: (context, i) {
          final item = items[i];
          return Semantics(
            button: true,
            label: item.title,
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => context.pushReplacement('/title/${item.slug}', extra: {'card': item}),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: NetflyImage(
                  image: item.poster,
                  fallback: CardArt(title: item),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
