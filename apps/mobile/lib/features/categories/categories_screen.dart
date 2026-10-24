import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_message.dart';

/// Categories: a tile per genre with its artwork (or, while that renders, a title's backdrop).
class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final genres = ref.watch(genresProvider);
    const grid = SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      childAspectRatio: 16 / 8,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
    );
    const padding = EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, NetflySpace.tabBar + 32);
    return Scaffold(
      appBar: AppBar(title: const Text('Categories')),
      body: switch (genres) {
        AsyncData(:final value) when value.isEmpty => const StateMessage(
          title: 'No categories yet',
          body: 'Nothing matches this translation filter right now.',
          icon: Icons.category_outlined,
        ),
        AsyncData(:final value) => GridView.builder(
          padding: padding,
          gridDelegate: grid,
          itemCount: value.length,
          itemBuilder: (context, i) {
            final g = value[i];
            return Semantics(
              button: true,
              label: '${g.name}, ${g.titleCount} title${g.titleCount == 1 ? '' : 's'}',
              excludeSemantics: true,
              child: GestureDetector(
                onTap: () => context.push('/categories/${g.slug}'),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      NetflyImage(
                        image: g.artwork ?? g.sample,
                        fallback: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: RadialGradient(
                              center: const Alignment(-0.6, -0.6),
                              colors: [t.accent.withValues(alpha: 0.4), const Color(0xFF17171F)],
                            ),
                          ),
                        ),
                      ),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomLeft,
                            end: Alignment.topRight,
                            colors: [Color(0xD9000000), Color(0x59000000), Color(0x00000000)],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 10,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              g.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: NetflyType.h2.copyWith(fontWeight: FontWeight.w800, color: Colors.white),
                            ),
                            Text(
                              '${g.titleCount} title${g.titleCount == 1 ? '' : 's'}',
                              style: NetflyType.meta.copyWith(color: Colors.white70),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
        AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(genresProvider)),
        _ => GridView.builder(
          padding: padding,
          gridDelegate: grid,
          itemCount: 8,
          itemBuilder: (_, _) => const Skeleton(radius: 12),
        ),
      },
    );
  }
}
