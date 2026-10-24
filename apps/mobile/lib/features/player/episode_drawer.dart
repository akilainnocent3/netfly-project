import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../brand/netfly_loader.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../widgets/netfly_image.dart';

/// The player's episode drawer: the current season, the playing episode marked.
Future<void> showEpisodeDrawer(
  BuildContext context, {
  required String slug,
  required int season,
  required int current,
  required ValueChanged<int> onPick,
}) {
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: const Color(0xF0181818),
    builder: (sheet) => FractionallySizedBox(
      heightFactor: 0.85,
      child: Consumer(
        builder: (context, ref, _) {
          final t = NetflyTheme.of(context);
          final episodes = ref.watch(episodesProvider((slug, season)));
          return SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  child: Text('Season $season', style: NetflyType.h3),
                ),
                Expanded(
                  child: switch (episodes) {
                    AsyncData(:final value) => ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: value.length,
                      itemBuilder: (context, i) {
                        final e = value[i];
                        final playing = e.id == current;
                        return Semantics(
                          button: true,
                          selected: playing,
                          label: 'Episode ${e.number}, ${e.name}${playing ? ', playing' : ''}',
                          excludeSemantics: true,
                          child: GestureDetector(
                            onTap: playing
                                ? () => Navigator.pop(sheet)
                                : () {
                                    Navigator.pop(sheet);
                                    onPick(e.id);
                                  },
                            child: Container(
                              width: 240,
                              margin: const EdgeInsets.only(right: 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: Container(
                                      decoration: BoxDecoration(
                                        border: playing ? Border.all(color: t.accent, width: 2) : null,
                                      ),
                                      child: AspectRatio(
                                        aspectRatio: 16 / 9,
                                        child: NetflyImage(
                                          image: e.thumbnail,
                                          fallback: ColoredBox(color: t.elevated),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${e.number}. ${e.name}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: NetflyType.body.copyWith(fontWeight: FontWeight.w600),
                                  ),
                                  if (e.synopsis != null)
                                    Text(
                                      e.synopsis!,
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: NetflyType.meta.copyWith(color: t.muted),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    AsyncError() => const Center(child: Text("We couldn't load the episodes.")),
                    _ => const Center(child: NetflyLoader()),
                  },
                ),
              ],
            ),
          );
        },
      ),
    ),
  );
}
