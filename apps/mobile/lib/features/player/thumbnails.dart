import 'dart:async';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:material_ui/material_ui.dart';

/// One scrub-preview thumbnail: a rectangle of a sprite sheet for a time range.
class ThumbCue {
  const ThumbCue(this.start, this.end, this.url, this.rect);
  final double start;
  final double end;
  final String url;
  final Rect rect;
}

/// Parses the same `thumbs.vtt` the web scrubber uses (`sprite.jpg#xywh=x,y,w,h` cues).
List<ThumbCue> parseThumbnails(String vtt, Uri base) {
  double seconds(String t) {
    final parts = t.trim().split(':').map(double.parse).toList();
    return parts.fold(0, (acc, p) => acc * 60 + p);
  }

  final cues = <ThumbCue>[];
  final lines = vtt.split('\n').map((l) => l.trim()).toList();
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].contains('-->') || i + 1 >= lines.length) continue;
    final times = lines[i].split('-->');
    final target = lines[i + 1];
    final hash = target.indexOf('#xywh=');
    if (hash < 0) continue;
    final xywh = target.substring(hash + 6).split(',').map(double.parse).toList();
    if (xywh.length != 4) continue;
    cues.add(
      ThumbCue(
        seconds(times[0]),
        seconds(times[1].split(' ').firstWhere((s) => s.isNotEmpty)),
        base.resolve(target.substring(0, hash)).toString(),
        Rect.fromLTWH(xywh[0], xywh[1], xywh[2], xywh[3]),
      ),
    );
  }
  return cues;
}

Future<List<ThumbCue>> loadThumbnails(Dio dio, String url) async {
  try {
    final response = await dio.get<String>(url, options: Options(responseType: ResponseType.plain));
    return parseThumbnails(response.data ?? '', Uri.parse(dio.options.baseUrl).resolve(url));
  } catch (_) {
    return const []; // the scrubber works without previews
  }
}

/// Paints one cue's rectangle from its sprite sheet.
class ThumbnailView extends StatefulWidget {
  const ThumbnailView({super.key, required this.cue, this.width = 160});
  final ThumbCue cue;
  final double width;

  @override
  State<ThumbnailView> createState() => _ThumbnailViewState();
}

final _sprites = <String, Future<ui.Image>>{};

Future<ui.Image> _sprite(String url) => _sprites.putIfAbsent(url, () {
  final completer = Completer<ui.Image>();
  final stream = CachedNetworkImageProvider(url).resolve(ImageConfiguration.empty);
  late final ImageStreamListener listener;
  listener = ImageStreamListener(
    (info, _) {
      completer.complete(info.image);
      stream.removeListener(listener);
    },
    onError: (e, _) {
      _sprites.remove(url);
      completer.completeError(e);
      stream.removeListener(listener);
    },
  );
  stream.addListener(listener);
  return completer.future;
});

class _ThumbnailViewState extends State<ThumbnailView> {
  ui.Image? _image;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(ThumbnailView old) {
    super.didUpdateWidget(old);
    if (old.cue.url != widget.cue.url) _load();
  }

  Future<void> _load() async {
    try {
      final image = await _sprite(widget.cue.url);
      if (mounted) setState(() => _image = image);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.cue.rect;
    return SizedBox(
      width: widget.width,
      height: widget.width * r.height / r.width,
      child: _image == null
          ? const ColoredBox(color: Color(0xFF232323))
          : CustomPaint(painter: _CropPainter(_image!, r)),
    );
  }
}

class _CropPainter extends CustomPainter {
  _CropPainter(this.image, this.rect);
  final ui.Image image;
  final Rect rect;

  @override
  void paint(Canvas canvas, Size size) =>
      canvas.drawImageRect(image, rect, Offset.zero & size, Paint()..filterQuality = FilterQuality.medium);

  @override
  bool shouldRepaint(_CropPainter old) => old.image != image || old.rect != rect;
}
