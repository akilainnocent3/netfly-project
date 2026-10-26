import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../brand/logo_mark.dart';
import '../../core/public_config.dart';
import '../../core/theme.dart';
import '../../core/viewer_prefs.dart';
import '../../widgets/usage_ring.dart';
import '../notifications/notifications_screen.dart';

/// The phone header: mark, the translation switcher top-centre, the viewing-time ring and the bell; below it the
/// Series / Films / Categories chips. Transparent over the hero, solid with blur once scrolled.
class HomeHeader extends ConsumerWidget implements PreferredSizeWidget {
  const HomeHeader({super.key, required this.solid, this.kind, this.showChips = true});

  /// 0…1: how far the page has scrolled past the hero top.
  final double solid;
  final String? kind;
  final bool showChips;

  @override
  Size get preferredSize => Size.fromHeight(NetflySpace.header + (showChips ? 48 : 0));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final top = MediaQuery.paddingOf(context).top;
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18 * solid, sigmaY: 18 * solid),
        child: Container(
          padding: EdgeInsets.only(top: top),
          decoration: BoxDecoration(
            color: t.bg.withValues(alpha: 0.85 * solid),
            gradient: solid < 1
                ? LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.6 * (1 - solid)),
                      Colors.transparent,
                    ],
                  )
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: NetflySpace.header,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    children: [
                      Semantics(
                        button: true,
                        label: '${ref.watch(publicConfigProvider).siteName} home',
                        child: InkResponse(
                          radius: 24,
                          onTap: () => context.go('/home'),
                          child: const SizedBox.square(dimension: 44, child: Center(child: LogoMark(size: 32))),
                        ),
                      ),
                      const Expanded(
                        child: Center(
                          child: FittedBox(fit: BoxFit.scaleDown, child: TranslationSwitcher()),
                        ),
                      ),
                      const UsageRing(),
                      const NotificationsBell(),
                    ],
                  ),
                ),
              ),
              if (showChips)
                SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter, vertical: 6),
                    children: [
                      if (kind != null) _Chip(label: '✕', semantic: 'All titles', onTap: () => context.go('/home')),
                      if (kind != 'movie')
                        _Chip(label: 'Series', selected: kind == 'series', onTap: () => context.go('/home/series')),
                      if (kind != 'series')
                        _Chip(label: 'Films', selected: kind == 'movie', onTap: () => context.go('/home/films')),
                      _Chip(label: 'Categories', onTap: () => context.push('/categories'), dropdown: true),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.onTap, this.selected = false, this.dropdown = false, this.semantic});

  final String label;
  final VoidCallback onTap;
  final bool selected;
  final bool dropdown;
  final String? semantic;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: Semantics(
      button: true,
      selected: selected,
      label: semantic ?? label,
      excludeSemantics: true,
      child: Material(
        color: selected ? Colors.white : Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(color: Colors.white.withValues(alpha: selected ? 1 : 0.5)),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: NetflyType.meta.copyWith(
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.black : Colors.white,
                  ),
                ),
                if (dropdown) const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// "Translated | Original" (plus "All" when Studio allows it) — the web's switcher.
class TranslationSwitcher extends ConsumerWidget {
  const TranslationSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final mode = ref.watch(translationModeProvider);
    final options = [
      ('translated', 'Translated'),
      ('not_translated', 'Original'),
      if (ref.watch(publicConfigProvider).flag('features.translation_filter_allow_all', false)) ('all', 'All'),
    ];
    return Semantics(
      label: 'Translation filter',
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (value, label) in options)
              Semantics(
                inMutuallyExclusiveGroup: true,
                checked: mode == value,
                button: true,
                label: label,
                excludeSemantics: true,
                child: GestureDetector(
                  onTap: () => ref.read(viewerPrefsProvider.notifier).setMode(value),
                  child: AnimatedContainer(
                    duration: NetflyMotion.fast,
                    constraints: const BoxConstraints(minHeight: 32),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: mode == value ? t.accent : Colors.transparent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      label,
                      style: NetflyType.meta.copyWith(
                        fontWeight: FontWeight.w700,
                        color: mode == value ? t.accentFg : Colors.white.withValues(alpha: 0.75),
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
