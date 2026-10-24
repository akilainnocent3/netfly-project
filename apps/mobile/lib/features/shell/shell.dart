import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/offline_banner.dart';

/// Bumped when the active tab is tapped again; each tab's scroll view animates to the top.
class TabReselect extends Notifier<(int, int)> {
  @override
  (int, int) build() => (-1, 0);

  void bump(int tab) => state = (tab, state.$2 + 1);
}

final tabReselectProvider = NotifierProvider<TabReselect, (int, int)>(TabReselect.new);

/// Scrolls [controller] to the top whenever [tab] is re-tapped.
void listenForTabReselect(WidgetRef ref, int tab, ScrollController controller) {
  ref.listen(tabReselectProvider, (_, next) {
    if (next.$1 == tab && controller.hasClients) {
      controller.animateTo(0, duration: NetflyMotion.slow, curve: NetflyMotion.easeOutExpo);
    }
  });
}

class _Tab {
  const _Tab(this.label, this.icon, this.active);
  final String label;
  final IconData icon;
  final IconData active;
}

const _tabs = [
  _Tab('Home', Icons.home_outlined, Icons.home_rounded),
  _Tab('New & Hot', Icons.local_fire_department_outlined, Icons.local_fire_department_rounded),
  _Tab('Search', Icons.search_rounded, Icons.search_rounded),
  _Tab('My List', Icons.bookmark_border_rounded, Icons.bookmark_rounded),
  _Tab('Profile', Icons.person_outline_rounded, Icons.person_rounded),
];

/// The phone layout: each tab keeps its own navigation stack and scroll position
/// (StatefulShellRoute.indexedStack); the tab bar is fixed and always one tap away (decision 52).
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      extendBody: true,
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(child: shell),
        ],
      ),
      bottomNavigationBar: _TabBar(
        index: shell.currentIndex,
        onTap: (i) {
          unawaited(HapticFeedback.selectionClick());
          if (i == shell.currentIndex) {
            // Re-tap: back to the tab's first page, then to the top.
            shell.goBranch(i, initialLocation: true);
            ref.read(tabReselectProvider.notifier).bump(i);
          } else {
            shell.goBranch(i);
          }
        },
      ),
    );
  }
}

class _TabBar extends ConsumerWidget {
  const _TabBar({required this.index, required this.onTap});

  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final user = ref.watch(userProvider);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.only(bottom: bottom),
      decoration: BoxDecoration(
        color: t.bg.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: t.line)),
      ),
      child: SizedBox(
        height: NetflySpace.tabBar,
        child: Row(
          children: [
            for (var i = 0; i < _tabs.length; i++)
              Expanded(
                child: Semantics(
                  selected: i == index,
                  button: true,
                  label: _tabs[i].label,
                  child: InkResponse(
                    onTap: () => onTap(i),
                    radius: 36,
                    child: ExcludeSemantics(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (i == 4 && user != null)
                            _Avatar(initial: user.fullName.isEmpty ? '?' : user.fullName[0], selected: i == index)
                          else
                            Icon(
                              i == index ? _tabs[i].active : _tabs[i].icon,
                              size: 24,
                              color: i == index ? Colors.white : t.muted,
                            ),
                          const SizedBox(height: 4),
                          Text(
                            _tabs[i].label,
                            maxLines: 1,
                            style: NetflyType.caption.copyWith(
                              color: i == index ? Colors.white : t.muted,
                              fontWeight: i == index ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initial, required this.selected});

  final String initial;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Container(
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.accent,
        borderRadius: BorderRadius.circular(4),
        border: selected ? Border.all(color: Colors.white, width: 1.5) : null,
      ),
      child: Text(
        initial.toUpperCase(),
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: t.accentFg),
      ),
    );
  }
}
