import 'package:dio/dio.dart';
import 'package:video_player/video_player.dart';

/// A subtitle rendition from the HLS master playlist (`#EXT-X-MEDIA:TYPE=SUBTITLES`).
class SubtitleTrack {
  const SubtitleTrack({required this.label, required this.language, required this.isDefault, required this.uri});
  final String label;
  final String language;
  final bool isDefault;
  final Uri uri;
}

Map<String, String> _attributes(String line) {
  final out = <String, String>{};
  for (final m in RegExp(r'([A-Z-]+)=("([^"]*)"|[^,]*)').allMatches(line)) {
    out[m.group(1)!] = m.group(3) ?? m.group(2)!;
  }
  return out;
}

Future<String> _text(Dio dio, Uri uri) async {
  final r = await dio.getUri<String>(uri, options: Options(responseType: ResponseType.plain));
  return r.data ?? '';
}

/// The same signed master playlist the player loads lists the subtitle playlists.
Future<List<SubtitleTrack>> loadSubtitleTracks(Dio dio, String masterUrl) async {
  try {
    final master = Uri.parse(dio.options.baseUrl).resolve(masterUrl);
    final text = await _text(dio, master);
    return [
      for (final line in text.split('\n'))
        if (line.startsWith('#EXT-X-MEDIA') && line.contains('TYPE=SUBTITLES'))
          (() {
            final a = _attributes(line);
            return SubtitleTrack(
              label: a['NAME'] ?? a['LANGUAGE'] ?? 'Subtitles',
              language: a['LANGUAGE'] ?? '',
              isDefault: a['DEFAULT'] == 'YES',
              uri: master.resolve(a['URI'] ?? ''),
            );
          })(),
    ];
  } catch (_) {
    return const [];
  }
}

/// Fetches a subtitle playlist's WebVTT segments and merges them into one caption file
/// (video_player renders captions from a [ClosedCaptionFile]).
Future<ClosedCaptionFile> loadWebVtt(Dio dio, SubtitleTrack track) async {
  final playlist = await _text(dio, track.uri);
  final segments = [
    for (final line in playlist.split('\n'))
      if (line.trim().isNotEmpty && !line.startsWith('#')) track.uri.resolve(line.trim()),
  ];
  final buffer = StringBuffer('WEBVTT\n\n');
  for (final segment in segments) {
    final vtt = await _text(dio, segment);
    for (final block in vtt.replaceAll('\r', '').split('\n\n')) {
      final b = block.trim();
      if (b.isEmpty || b.startsWith('WEBVTT') || b.startsWith('X-TIMESTAMP-MAP') || b.startsWith('NOTE')) continue;
      buffer
        ..write(b)
        ..write('\n\n');
    }
  }
  return WebVTTCaptionFile(buffer.toString());
}
