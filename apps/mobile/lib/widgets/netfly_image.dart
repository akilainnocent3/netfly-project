import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/image_ref.dart';
import '../core/env.dart';

/// The server's fixed render widths (backend/apps/media/images.py `WIDTHS`).
const imageWidths = [160, 320, 480, 640, 960, 1280, 1920, 2560];

/// `/api/v1/img/<key>/w<width>` — the same cached redirect to the signed S3/CDN URL the web's
/// image loader uses (decision 11); the smallest render at least as wide as the box needs.
String imageUrl(String key, double logicalWidth, double dpr) {
  final needed = logicalWidth * dpr;
  final width = imageWidths.firstWhere((w) => w >= needed, orElse: () => imageWidths.last);
  return '${Env.apiUrl}/api/v1/img/$key/w$width';
}

/// An API image with its blur placeholder and dominant colour, fading in when loaded (the web's
/// `NetflyImage`). [fallback] shows when there is no image.
class NetflyImage extends StatelessWidget {
  const NetflyImage({
    super.key,
    required this.image,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.fallback,
    this.semanticLabel,
  });

  final ImageRef? image;
  final BoxFit fit;
  final Alignment alignment;
  final Widget? fallback;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final ref = image;
    if (ref == null) return fallback ?? const SizedBox.expand();
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return LayoutBuilder(
      builder: (context, box) {
        final width = box.maxWidth.isFinite ? box.maxWidth : MediaQuery.sizeOf(context).width;
        final placeholder = _Placeholder(ref);
        return Semantics(
          image: semanticLabel != null,
          label: semanticLabel,
          excludeSemantics: true,
          child: CachedNetworkImage(
            imageUrl: imageUrl(ref.key, width, dpr),
            fit: fit,
            alignment: alignment,
            width: box.maxWidth.isFinite ? box.maxWidth : null,
            height: box.maxHeight.isFinite ? box.maxHeight : null,
            fadeInDuration: const Duration(milliseconds: 200),
            fadeOutDuration: Duration.zero,
            memCacheWidth: (width * dpr).round(),
            placeholder: (_, _) => placeholder,
            errorWidget: (_, url, error) {
              if (!kReleaseMode) debugPrint('NetflyImage: $url failed: $error');
              return fallback ?? placeholder;
            },
          ),
        );
      },
    );
  }

  /// Warm the cache for an image about to scroll into view (rows precache one row ahead).
  static Future<void> precache(BuildContext context, ImageRef? ref, double logicalWidth) async {
    if (ref == null) return;
    final url = imageUrl(ref.key, logicalWidth, MediaQuery.devicePixelRatioOf(context));
    // A failed precache is just a cache miss later (not an error to report).
    await precacheImage(
      CachedNetworkImageProvider(url),
      context,
      onError: (error, _) {
        if (!kReleaseMode) debugPrint('NetflyImage: precache $url failed: $error');
      },
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.ref);

  final ImageRef ref;

  @override
  Widget build(BuildContext context) {
    final color = _hex(ref.color);
    final blur = ref.blur;
    if (blur.startsWith('data:image') && blur.contains(',')) {
      try {
        return Image.memory(
          base64Decode(blur.substring(blur.indexOf(',') + 1)),
          fit: BoxFit.cover,
          gaplessPlayback: true,
          filterQuality: FilterQuality.low,
          color: color,
          colorBlendMode: BlendMode.dstOver,
        );
      } catch (_) {
        // fall through to the dominant colour
      }
    }
    return ColoredBox(color: color ?? const Color(0xFF232323));
  }

  static Color? _hex(String? value) {
    if (value == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) return null;
    return Color(0xFF000000 | int.parse(value.substring(1), radix: 16));
  }
}
