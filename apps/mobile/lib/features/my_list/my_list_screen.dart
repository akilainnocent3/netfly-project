import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../brand/netfly_loader.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../widgets/brand_refresh.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';
import '../shell/shell.dart';

class MyListScreen extends ConsumerStatefulWidget {
  const MyListScreen({super.key});

  @override
  ConsumerState<MyListScreen> createState() => _MyListScreenState();
}

class _MyListScreenState extends ConsumerState<MyListScreen> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    listenForTabReselect(ref, 3, _scroll);
    final list = ref.watch(myListProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text('My List', style: NetflyType.h2.copyWith(fontSize: 22, fontWeight: FontWeight.w800)),
        centerTitle: false,
      ),
      body: BrandRefresh(
        onRefresh: () async {
          ref.invalidate(myListProvider);
          await ref.read(myListProvider.future);
        },
        child: switch (list) {
          AsyncData(:final value) when value.isEmpty => ListView(
            physics: BrandRefresh.physics,
            children: [
              StateMessage(
                title: 'Your list is empty',
                body: 'Add films and series with + My List to find them here.',
                icon: Icons.bookmark_border_rounded,
                actionLabel: 'Browse',
                onAction: () => context.go('/home'),
              ),
            ],
          ),
          AsyncData(:final value) => GridView.builder(
            controller: _scroll,
            physics: BrandRefresh.physics,
            padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, NetflySpace.tabBar + 32),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 16 / 9,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: value.length,
            itemBuilder: (context, i) => LayoutBuilder(
              builder: (context, box) => TitleCardView(title: value[i], width: box.maxWidth, row: 'my-list'),
            ),
          ),
          AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(myListProvider)),
          _ => const Center(child: NetflyLoader()),
        },
      ),
    );
  }
}
