import 'dart:math' as math;

import 'package:cupertino_ui/cupertino_ui.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';

import 'public_config.dart';

/// NETFLY design tokens, mirroring the web app (`apps/client/src/app/globals.css` and
/// `packages/ui/src/theme.ts`). Brand colours and the font come from the public config
/// (`branding.*`), exactly as on the web; the constants are the fallbacks.
@immutable
class NetflyTheme extends ThemeExtension<NetflyTheme> {
  const NetflyTheme({
    required this.accent,
    required this.accentFg,
    required this.bg,
    required this.surface,
    required this.text,
    this.elevated = const Color(0xFF232323),
    this.muted = const Color(0xFFB3B3B3),
    this.subtle = const Color(0xFF808080),
    this.line = const Color(0x1AFFFFFF),
    this.match = const Color(0xFF46D369),
    this.secondaryButton = const Color(0xB36D6D6E),
    this.fontFamily = 'Inter Tight',
  });

  factory NetflyTheme.fromConfig(PublicConfig config) {
    final accent = parseHex(config.str('branding.accent_color', '#E50914'), defaultAccent);
    return NetflyTheme(
      accent: accent,
      accentFg: contrastOn(accent),
      bg: parseHex(config.str('branding.background_color', '#141414'), const Color(0xFF141414)),
      surface: parseHex(config.str('branding.surface_color', '#181818'), const Color(0xFF181818)),
      text: parseHex(config.str('branding.text_color', '#FFFFFF'), Colors.white),
      fontFamily: config.str('branding.font_family', 'Inter Tight'),
    );
  }

  static const defaultAccent = Color(0xFFE50914);
  static const fallback = NetflyTheme(
    accent: defaultAccent,
    accentFg: Colors.white,
    bg: Color(0xFF141414),
    surface: Color(0xFF181818),
    text: Colors.white,
  );

  final Color accent;
  final Color accentFg;
  final Color bg;
  final Color surface;
  final Color elevated;
  final Color text;
  final Color muted;
  final Color subtle;
  final Color line;
  final Color match;
  final Color secondaryButton;
  final String fontFamily;

  static NetflyTheme of(BuildContext context) => Theme.of(context).extension<NetflyTheme>() ?? fallback;

  /// Readable foreground (near-black or white) for text on [color] — `contrastOn` in theme.ts.
  static Color contrastOn(Color color) {
    double channel(double c) => c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
    final luminance = 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    return luminance > 0.4 ? const Color(0xFF141414) : Colors.white;
  }

  static Color parseHex(String hex, Color fallback) {
    final match = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex.trim());
    if (match == null) return fallback;
    return Color(0xFF000000 | int.parse(match.group(1)!, radix: 16));
  }

  @override
  NetflyTheme copyWith({Color? accent, Color? bg, Color? surface, Color? text, String? fontFamily}) => NetflyTheme(
    accent: accent ?? this.accent,
    accentFg: contrastOn(accent ?? this.accent),
    bg: bg ?? this.bg,
    surface: surface ?? this.surface,
    text: text ?? this.text,
    fontFamily: fontFamily ?? this.fontFamily,
  );

  @override
  NetflyTheme lerp(NetflyTheme? other, double t) {
    if (other == null) return this;
    return NetflyTheme(
      accent: Color.lerp(accent, other.accent, t)!,
      accentFg: t < 0.5 ? accentFg : other.accentFg,
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      text: Color.lerp(text, other.text, t)!,
      fontFamily: t < 0.5 ? fontFamily : other.fontFamily,
    );
  }
}

/// Type scale (globals.css `--text-*`), at phone width (the clamp() minimums).
abstract final class NetflyType {
  static const display = TextStyle(fontSize: 40, height: 0.92, letterSpacing: -1.2, fontWeight: FontWeight.w900);
  static const title = TextStyle(fontSize: 30, height: 0.98, fontWeight: FontWeight.w900);
  static const h1 = TextStyle(fontSize: 26, height: 1.1, fontWeight: FontWeight.w900, letterSpacing: -0.4);
  static const h2 = TextStyle(fontSize: 17, height: 1.25, fontWeight: FontWeight.w700);
  static const h3 = TextStyle(fontSize: 22, height: 1.3, fontWeight: FontWeight.w700);
  static const lead = TextStyle(fontSize: 18, height: 1.5);
  static const body = TextStyle(fontSize: 15, height: 1.5);
  static const meta = TextStyle(fontSize: 13, height: 1.35);
  static const caption = TextStyle(fontSize: 12, height: 1.3);
  static const card = TextStyle(fontSize: 12, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.2);
  static const numeral = TextStyle(fontSize: 90, height: 0.78, fontWeight: FontWeight.w900);

  /// The badge ribbon (DECISIONS 52a): ≈10 px caps, 0.04em tracking.
  static const badge = TextStyle(fontSize: 9.5, height: 1.1, fontWeight: FontWeight.w700, letterSpacing: 0.38);
}

/// Spacing, radii and motion (Tailwind's scale as the web uses it).
abstract final class NetflySpace {
  static const gutter = 16.0; // px-[max(4vw,16px)] at phone width
  static const tabBar = 64.0; // --tabbar-h without the safe area
  static const header = 56.0;
  static const rowGap = 8.0;
  static const radiusCard = 6.0; // rounded-md
  static const radiusButton = 4.0;
  static const radiusBadge = 2.0;
  static const touch = 44.0; // minimum touch target (decision 52)
}

abstract final class NetflyMotion {
  /// --ease-out-expo, the web's signature curve.
  static const easeOutExpo = Cubic(0.16, 1, 0.3, 1);
  static const fast = Duration(milliseconds: 150);
  static const base = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 400);
  static const loaderLoop = Duration(milliseconds: 1600);
  static const loaderDelay = Duration(milliseconds: 200);
  static const loaderMin = Duration(milliseconds: 400);
}

/// [brandFonts] off keeps the platform font (widget tests run without network access).
ThemeData buildTheme(NetflyTheme tokens, {bool brandFonts = true}) {
  TextTheme fonts(TextTheme base) {
    if (!brandFonts) return base;
    try {
      return GoogleFonts.getTextTheme(tokens.fontFamily, base);
    } catch (_) {
      return GoogleFonts.interTightTextTheme(base); // an unknown family name: the default font
    }
  }

  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: tokens.bg,
    colorScheme: ColorScheme.dark(
      primary: tokens.accent,
      onPrimary: tokens.accentFg,
      secondary: tokens.text,
      surface: tokens.surface,
      onSurface: tokens.text,
      error: const Color(0xFFE87C03),
    ),
    splashFactory: InkSparkle.splashFactory,
    extensions: [tokens],
  );
  final text = fonts(base.textTheme).apply(bodyColor: tokens.text, displayColor: tokens.text);
  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      foregroundColor: tokens.text,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: tokens.elevated,
      contentTextStyle: NetflyType.body.copyWith(color: tokens.text),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: tokens.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: tokens.surface, modalBackgroundColor: tokens.surface),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}
