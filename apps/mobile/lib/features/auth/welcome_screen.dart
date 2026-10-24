import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/image_ref.dart';
import '../../brand/logo_mark.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/netfly_image.dart';

/// The landing page's poster wall: `{results: [{key, blur}]}`.
final _posterWallProvider = FutureProvider.autoDispose<List<ImageRef>>((ref) async {
  final response = await ref.watch(apiProvider).catalog.posterWall();
  return [
    for (final item in response.results ?? const [])
      if (item is Map && item['key'] is String)
        ImageRef(key: item['key'] as String, blur: '${item['blur'] ?? ''}', color: ''),
  ];
});

/// Signed out: the poster wall behind the wordmark, Sign in / Get started, or browse first
/// (signed-out visitors browse the real app — decision 50).
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key, this.next});

  final String? next;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final site = ref.watch(publicConfigProvider).siteName;
    final wall = ref.watch(_posterWallProvider).value ?? const [];
    final q = next == null ? '' : '?next=${Uri.encodeComponent(next!)}';
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (wall.isNotEmpty)
            Opacity(
              opacity: 0.45,
              child: GridView.count(
                crossAxisCount: 3,
                childAspectRatio: 2 / 3,
                physics: const NeverScrollableScrollPhysics(),
                children: [for (final p in wall.take(18)) NetflyImage(image: p)],
              ),
            ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black.withValues(alpha: 0.6), t.bg.withValues(alpha: 0.7), t.bg],
                stops: const [0, 0.5, 0.85],
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const SizedBox(height: 16),
                  const Wordmark(height: 32),
                  const Spacer(),
                  Text(
                    'Unlimited films, series and more.',
                    textAlign: TextAlign.center,
                    style: NetflyType.title.copyWith(color: t.text),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Watch on your phone. Translated or in the original — your choice.',
                    textAlign: TextAlign.center,
                    style: NetflyType.lead.copyWith(color: t.muted),
                  ),
                  const SizedBox(height: 28),
                  NetflyButton(
                    label: 'Get started',
                    size: NetflyButtonSize.lg,
                    expand: true,
                    onPressed: () => context.push('/signup$q'),
                  ),
                  const SizedBox(height: 12),
                  NetflyButton(
                    label: 'Sign in',
                    size: NetflyButtonSize.lg,
                    expand: true,
                    variant: NetflyButtonVariant.secondary,
                    onPressed: () => context.push('/signin$q'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => context.go('/home'),
                    child: Text(
                      'Browse $site first',
                      style: NetflyType.body.copyWith(color: t.muted, decoration: TextDecoration.underline),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
