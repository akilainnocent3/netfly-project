import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

import '../api/generated/models/title_card.dart';
import '../brand/netfly_loader.dart';
import '../core/connectivity.dart';
import '../core/http.dart';

/// A muted preview (the trailer, or a 720p-capped slice of the title — decision 16) that fades
/// in over the artwork. It only starts when the viewer allows it: "Autoplay previews", Data saver
/// (Wi-Fi only) and reduced motion. It pauses while the route isn't visible.
class PreviewPlayer extends ConsumerStatefulWidget {
  const PreviewPlayer({
    super.key,
    required this.title,
    this.delay = const Duration(milliseconds: 1200),
    this.loop = true,
    this.fit = BoxFit.cover,
  });

  final TitleCard title;
  final Duration delay;
  final bool loop;
  final BoxFit fit;

  @override
  ConsumerState<PreviewPlayer> createState() => _PreviewPlayerState();
}

class _PreviewPlayerState extends ConsumerState<PreviewPlayer> {
  VideoPlayerController? _controller;
  Timer? _timer;
  bool _visible = false;
  bool _warming = false;
  bool _muted = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _schedule();
  }

  void _schedule() {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final allowed = widget.title.hasPreview && !reduced && ref.read(previewAutoplayProvider);
    if (!allowed || _timer != null || _controller != null) return;
    _timer = Timer(widget.delay, _start);
  }

  Future<void> _start() async {
    if (!mounted) return;
    setState(() => _warming = true);
    try {
      final info = await ref.read(apiProvider).playback.playback(slug: widget.title.slug, preview: true);
      if (!mounted) return;
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(Uri.parse(ref.read(dioProvider).options.baseUrl).resolve(info.masterUrl).toString()),
        formatHint: VideoFormat.hls,
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );
      _controller = controller;
      await controller.initialize();
      await controller.setVolume(0);
      await controller.setLooping(widget.loop);
      await controller.seekTo(Duration(milliseconds: (info.startAt * 1000).round()));
      if (!mounted) return;
      await controller.play();
      setState(() {
        _visible = true;
        _warming = false;
      });
    } catch (_) {
      if (mounted) setState(() => _warming = false); // the artwork simply stays
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Turning previews off (or leaving Wi-Fi with Data saver on) stops a playing preview.
    ref.listen(previewAutoplayProvider, (_, allowed) {
      if (!allowed) {
        _controller?.pause();
        setState(() => _visible = false);
      } else {
        _schedule();
      }
    });
    final controller = _controller;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (controller != null && controller.value.isInitialized)
          AnimatedOpacity(
            opacity: _visible ? 1 : 0,
            duration: const Duration(milliseconds: 500),
            child: FittedBox(
              fit: widget.fit,
              clipBehavior: Clip.hardEdge,
              child: SizedBox(
                width: controller.value.size.width,
                height: controller.value.size.height,
                child: VideoPlayer(controller),
              ),
            ),
          ),
        if (_warming) const Positioned(top: 8, right: 8, child: NetflyLoader(size: LoaderSize.sm, decorative: true)),
        if (_visible)
          Positioned(
            right: 8,
            bottom: 8,
            child: Semantics(
              button: true,
              label: _muted ? 'Unmute' : 'Mute',
              child: InkResponse(
                radius: 24,
                onTap: () {
                  setState(() => _muted = !_muted);
                  controller?.setVolume(_muted ? 0 : 1);
                },
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.black.withValues(alpha: 0.45),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 1.5),
                  ),
                  child: Icon(_muted ? Icons.volume_off_rounded : Icons.volume_up_rounded, size: 18),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
