import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/public_config.dart';
import '../core/theme.dart';
import 'router.dart';

class NetflyApp extends ConsumerWidget {
  const NetflyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(publicConfigProvider);
    final tokens = NetflyTheme.fromConfig(config);
    return MaterialApp.router(
      title: config.siteName,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(tokens),
      darkTheme: buildTheme(tokens),
      themeMode: ThemeMode.dark,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        // Dynamic type up to 1.3× (larger sizes would break the 16:9 card layouts).
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(textScaler: media.textScaler.clamp(maxScaleFactor: 1.3)),
          child: child!,
        );
      },
    );
  }
}
