import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/connectivity.dart';
import '../core/theme.dart';

/// Slides in while the device is offline (the web's offline banner).
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offline = ref.watch(isOfflineProvider);
    final t = NetflyTheme.of(context);
    return AnimatedSize(
      duration: NetflyMotion.base,
      curve: NetflyMotion.easeOutExpo,
      child: offline
          ? Semantics(
              liveRegion: true,
              child: Container(
                width: double.infinity,
                color: t.elevated,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(Icons.wifi_off_rounded, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "You're offline. We'll refresh when you're back.",
                        style: NetflyType.meta.copyWith(color: t.text),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : const SizedBox(width: double.infinity),
    );
  }
}
