import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../brand/logo_mark.dart';
import '../../brand/netfly_loader.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';

/// Cold start: after the native splash (static mark on #141414) the wordmark's ribbons drop in
/// (under 1.2 s, tap to skip) while the session restores; the router moves on as soon as it
/// has. A warm start (the app was only in the background) never shows this screen.
class StartScreen extends ConsumerStatefulWidget {
  const StartScreen({super.key});

  @override
  ConsumerState<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends ConsumerState<StartScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _reveal = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final enabled = ref.read(publicConfigProvider).flag('intro.on_app_open', true);
    if (reduced || !enabled) {
      _reveal.value = 1;
    } else if (!_reveal.isAnimating && _reveal.value == 0) {
      _reveal.forward();
    }
  }

  @override
  void dispose() {
    _reveal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final session = ref.watch(sessionProvider);
    return Scaffold(
      backgroundColor: const Color(0xFF141414),
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _reveal.value = 1, // skip
        child: Stack(
          children: [
            Center(
              child: AnimatedBuilder(
                animation: _reveal,
                builder: (_, _) => Wordmark(height: 44, reveal: _reveal.value),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 96,
              child: Center(
                child: session.hasError
                    ? Column(
                        children: [
                          Text("You're offline", style: NetflyType.h3.copyWith(color: t.text)),
                          const SizedBox(height: 12),
                          NetflyButton(
                            label: 'Try again',
                            variant: NetflyButtonVariant.secondary,
                            onPressed: () => ref.invalidate(sessionProvider),
                          ),
                        ],
                      )
                    // Only if restoring takes long does the loader appear (after its delay).
                    : const NetflyLoader(delay: Duration(milliseconds: 1400), label: 'Signing you in…'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
