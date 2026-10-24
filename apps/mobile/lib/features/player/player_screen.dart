import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:video_player/video_player.dart';
import 'package:volume_controller/volume_controller.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../api/generated/models/event_kind_enum.dart';
import '../../api/generated/models/playback.dart';
import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/connectivity.dart';
import '../../core/env.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import 'episode_drawer.dart';
import 'pip.dart';
import 'scrubber.dart';
import 'subtitles.dart';
import 'thumbnails.dart';
import 'tracker.dart';

/// Titles whose intro already played this session (`intro.before_playback = once_per_title_per_session`).
final _introPlayed = <String>{};

/// Consecutive autoplayed episodes, for "Are you still watching?".
int _autoplayChain = 0;

/// The player: same endpoints, signed HLS URLs, progress cadence and completion rules as the web
/// (decision 17), the brand ident first (decision 49), and custom controls matching the web.
class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key, required this.slug, this.episode, this.autoplayed = false});

  final String slug;
  final int? episode;
  final bool autoplayed;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

enum _Phase { loading, intro, playing, ended, error, limit }

class _PlayerScreenState extends ConsumerState<PlayerScreen> with WidgetsBindingObserver {
  _Phase _phase = _Phase.loading;
  Playback? _info;
  VideoPlayerController? _video;
  VideoPlayerController? _intro;
  PlaybackTracker? _tracker;
  UsageMeter? _meter;
  ApiError? _error;
  List<ThumbCue> _thumbs = const [];
  List<SubtitleTrack> _subtitleTracks = const [];
  SubtitleTrack? _subtitle;
  int? _maxHeight;
  double _speed = 1;

  bool _controls = true;
  bool _locked = false;
  bool _buffering = false;
  bool _wasPlaying = false;
  Timer? _hideTimer;
  Timer? _ticker;
  Timer? _bufferTimer;
  DateTime? _openedAt;
  DateTime? _bufferStart;
  int? _countdown;
  Timer? _countdownTimer;
  bool _nextDismissed = false;
  bool _askStillWatching = false;
  String? _toast;

  // Swipe gestures (left: brightness, right: volume).
  double? _gestureLevel;
  bool _gestureBrightness = false;
  ({bool forward, int key})? _ripple;

  PublicConfig get _config => ref.read(publicConfigProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _openedAt = DateTime.now();
    _enterFullScreen();
    _chain();
    unawaited(_load());
  }

  void _chain() {
    _autoplayChain = widget.autoplayed ? _autoplayChain + 1 : 0;
    _askStillWatching =
        widget.autoplayed && _autoplayChain >= _config.integer('playback.still_watching_after_episodes', 3);
  }

  Future<void> _enterFullScreen() async {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    await SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    await WakelockPlus.enable();
  }

  Future<void> _exitFullScreen() async {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    await WakelockPlus.disable();
    await ScreenBrightness.instance.resetApplicationScreenBrightness().catchError((_) {});
  }

  // -- loading ---------------------------------------------------------------------------
  /// The viewer's preferred quality (Account → Playback): Auto, a fixed height, or Data saver.
  int? _qualityCap() {
    final quality = ref.read(userProvider)?.preferredQuality ?? 'auto';
    if (quality == 'data_saver') return _config.integer('playback.data_saver_max_height', 480);
    return int.tryParse(quality);
  }

  Future<void> _load() async {
    final api = ref.read(apiProvider);
    try {
      final info = await api.playback.playback(slug: widget.slug, episode: widget.episode);
      _info = info;
      _maxHeight = _qualityCap();
      unawaited(
        loadThumbnails(
          ref.read(dioProvider),
          info.thumbnailsUrl,
        ).then((t) => mounted ? setState(() => _thumbs = t) : null),
      );
      unawaited(
        loadSubtitleTracks(ref.read(dioProvider), info.masterUrl).then((tracks) {
          if (!mounted) return;
          setState(() => _subtitleTracks = tracks);
          final preferred = ref.read(userProvider)?.subtitlesLanguage;
          final pick =
              tracks.where((t) => t.language == preferred).firstOrNull ?? tracks.where((t) => t.isDefault).firstOrNull;
          if (preferred != null && preferred.isNotEmpty && pick != null) unawaited(_setSubtitle(pick));
        }),
      );
      await _openVideo(start: info.startAt);
      if (_shouldPlayIntro(info)) {
        await _playIntro();
      } else {
        _startContent();
      }
    } on DioException catch (e) {
      final error = ApiError.from(e);
      if (!mounted) return;
      setState(() {
        _error = error;
        _phase = error.code == 'usage_limit_reached' ? _Phase.limit : _Phase.error;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = ApiError.from(e);
          _phase = _Phase.error;
        });
      }
    }
  }

  String _masterUrl() {
    final base = Uri.parse(Env.apiUrl).resolve(_info!.masterUrl);
    final cap = _maxHeight;
    if (cap == null) return base.toString();
    return base.replace(queryParameters: {...base.queryParameters, 'max_height': '$cap'}).toString();
  }

  Future<void> _openVideo({required double start}) async {
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(_masterUrl()),
      formatHint: VideoFormat.hls,
      videoPlayerOptions: VideoPlayerOptions(allowBackgroundPlayback: false),
    );
    await controller.initialize();
    await controller.seekTo(Duration(milliseconds: (start * 1000).round()));
    await controller.setPlaybackSpeed(_speed);
    controller.addListener(_onVideo);
    final old = _video;
    _video = controller;
    old?.removeListener(_onVideo);
    await old?.dispose();
  }

  bool _shouldPlayIntro(Playback info) {
    if (!_config.flag('intro.enabled', true)) return false;
    final when = _config.str('intro.before_playback', 'always');
    if (when == 'off') return false;
    if (widget.autoplayed && !_config.flag('intro.on_autoplay_next_episode', false)) return false;
    if (when == 'once_per_title_per_session' && _introPlayed.contains(info.title.slug)) return false;
    return true;
  }

  /// The NETFLY ident, with sound (Play was a tap), while the title buffers paused underneath.
  /// A clip that hasn't started within 1.5 s is skipped (decision 49).
  Future<void> _playIntro() async {
    _introPlayed.add(_info!.title.slug);
    final url = _config.str('intro.video_url_720', '');
    final intro = url.isEmpty
        ? VideoPlayerController.asset('assets/brand/netfly-intro-720p.mp4')
        : VideoPlayerController.networkUrl(Uri.parse(Uri.parse(Env.apiUrl).resolve(url).toString()));
    _intro = intro;
    try {
      await intro.initialize().timeout(const Duration(milliseconds: 1500));
    } catch (_) {
      _endIntro();
      return;
    }
    if (!mounted) return;
    setState(() => _phase = _Phase.intro);
    intro.addListener(() {
      final v = intro.value;
      if (v.isInitialized && v.position >= v.duration && _phase == _Phase.intro) _endIntro();
    });
    await intro.play();
  }

  void _endIntro() {
    final intro = _intro;
    _intro = null;
    unawaited(intro?.dispose());
    _startContent();
  }

  void _startContent() {
    final video = _video;
    final info = _info;
    if (video == null || info == null || !mounted) return;
    if (_askStillWatching) {
      setState(() => _phase = _Phase.playing);
      return; // waits for "Continue watching"
    }
    setState(() => _phase = _Phase.playing);
    final api = ref.read(apiProvider);
    PlayerClock clock() {
      final v = video.value;
      return (
        position: v.position.inMilliseconds / 1000,
        duration: v.duration.inMilliseconds / 1000,
        playing: v.isPlaying,
        buffering: v.isBuffering,
        rate: v.playbackSpeed,
      );
    }

    _tracker = PlaybackTracker(
      api: api,
      sessionId: info.sessionId,
      titleId: info.title.id,
      episodeId: info.episode?.id,
      clock: clock,
      progressEvery: Duration(seconds: _config.integer('playback.progress_save_seconds', 10)),
      flushEvery: Duration(seconds: _config.integer('playback.event_flush_seconds', 15)),
    )..start();
    if (info.metered) {
      _meter = UsageMeter(
        api: api,
        sessionId: info.sessionId,
        clock: clock,
        every: Duration(seconds: _config.integer('usage.heartbeat_seconds', 30)),
        onSnapshot: (s) {
          if (!s.allowed && mounted) {
            unawaited(video.pause());
            setState(() => _phase = _Phase.limit);
          }
        },
        renewSession: () async {
          try {
            return (await api.playback.playback(slug: widget.slug, episode: widget.episode)).sessionId;
          } catch (_) {
            return null;
          }
        },
      )..start();
    }
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) {
      _tracker?.tick();
      _meter?.tick();
    });
    unawaited(video.play());
    final startup = DateTime.now().difference(_openedAt!).inMilliseconds.toDouble();
    _tracker?.track(EventKindEnum.start, value: startup);
    _scheduleHide();
  }

  // -- video events ----------------------------------------------------------------------
  void _onVideo() {
    final video = _video;
    if (video == null || !mounted) return;
    final v = video.value;
    if (v.hasError && _phase != _Phase.error) {
      _tracker?.track(EventKindEnum.error, data: {'message': v.errorDescription});
      setState(() {
        _phase = _Phase.error;
        _error = const ApiError('playback', "This title couldn't play. Check your connection and try again.");
      });
      return;
    }
    if (v.isPlaying != _wasPlaying) {
      _wasPlaying = v.isPlaying;
      if (_phase == _Phase.playing) {
        _tracker?.track(v.isPlaying ? EventKindEnum.play : EventKindEnum.pause);
        if (v.isPlaying) {
          _meter?.resumed();
        } else {
          _meter?.paused();
          unawaited(_tracker?.saveProgress());
        }
      }
      PictureInPicture.setPlaying(v.isPlaying);
    }
    // Rebuffering shows the loader after 250 ms (the web's rule), and is reported.
    if (v.isBuffering && _bufferStart == null && v.isPlaying) {
      _bufferStart = DateTime.now();
      _bufferTimer = Timer(const Duration(milliseconds: 250), () => mounted ? setState(() => _buffering = true) : null);
    } else if (!v.isBuffering && _bufferStart != null) {
      final stalled = DateTime.now().difference(_bufferStart!).inMilliseconds;
      _bufferStart = null;
      _bufferTimer?.cancel();
      if (stalled > 250) _tracker?.track(EventKindEnum.rebuffer, value: stalled.toDouble());
      setState(() => _buffering = false);
    }
    final duration = v.duration.inMilliseconds / 1000;
    final position = v.position.inMilliseconds / 1000;
    if (_phase == _Phase.playing && duration > 0 && position >= duration - 0.3 && !v.isPlaying) _onEnded();
    if (_phase == _Phase.playing) setState(() {});
  }

  void _onEnded() {
    _tracker?.track(EventKindEnum.complete);
    unawaited(_tracker?.saveProgress());
    final next = _info?.next;
    if (next != null && !_nextDismissed && ref.read(nextEpisodeAutoplayProvider)) {
      _startCountdown();
    } else {
      setState(() => _phase = _Phase.ended);
    }
  }

  void _startCountdown() {
    if (_countdownTimer != null) return;
    setState(() {
      _phase = _Phase.ended;
      _countdown = _config.integer('playback.next_episode_countdown_seconds', 5);
    });
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      final left = (_countdown ?? 1) - 1;
      if (left <= 0) {
        timer.cancel();
        _playNext(auto: true);
      } else {
        setState(() => _countdown = left);
      }
    });
  }

  void _playNext({bool auto = false}) {
    final next = _info?.next;
    if (next == null) return;
    _countdownTimer?.cancel();
    context.pushReplacement('/watch/${widget.slug}?episode=${next.id}${auto ? '&autoplay=1' : ''}');
  }

  // -- controls --------------------------------------------------------------------------
  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(Duration(milliseconds: _config.integer('playback.controls_hide_ms', 3000)), () {
      if (mounted && (_video?.value.isPlaying ?? false)) setState(() => _controls = false);
    });
  }

  void _toggleControls() {
    setState(() => _controls = !_controls);
    if (_controls) _scheduleHide();
  }

  Future<void> _togglePlay() async {
    final video = _video;
    if (video == null) return;
    unawaited(HapticFeedback.lightImpact());
    if (video.value.isPlaying) {
      await video.pause();
    } else {
      await video.play();
    }
    _scheduleHide();
    setState(() {});
  }

  Future<void> _seekBy(double seconds) async {
    final video = _video;
    if (video == null) return;
    final target = video.value.position + Duration(milliseconds: (seconds * 1000).round());
    await _seekTo(target.inMilliseconds / 1000);
    setState(() => _ripple = (forward: seconds > 0, key: DateTime.now().millisecondsSinceEpoch));
    unawaited(HapticFeedback.selectionClick());
  }

  Future<void> _seekTo(double seconds) async {
    final video = _video;
    if (video == null) return;
    final duration = video.value.duration.inMilliseconds / 1000;
    final clamped = seconds.clamp(0, duration > 0 ? duration : seconds).toDouble();
    _tracker?.track(EventKindEnum.seek, value: clamped);
    await video.seekTo(Duration(milliseconds: (clamped * 1000).round()));
  }

  Future<void> _setQuality(int? cap) async {
    final video = _video;
    if (video == null) return;
    final position = video.value.position.inMilliseconds / 1000;
    final playing = video.value.isPlaying;
    _maxHeight = cap;
    _tracker?.track(EventKindEnum.quality, value: (cap ?? 0).toDouble());
    await _openVideo(start: position);
    if (_subtitle != null) await _setSubtitle(_subtitle);
    if (playing) await _video?.play();
    if (mounted) setState(() {});
  }

  Future<void> _setSubtitle(SubtitleTrack? track) async {
    _subtitle = track;
    final video = _video;
    if (video == null) return;
    if (track == null) {
      await video.setClosedCaptionFile(null);
    } else {
      await video.setClosedCaptionFile(loadWebVtt(ref.read(dioProvider), track));
    }
    if (mounted) setState(() {});
  }

  void _showToast(String text) {
    setState(() => _toast = text);
    Timer(const Duration(seconds: 2), () => mounted ? setState(() => _toast = null) : null);
  }

  // -- lifecycle -------------------------------------------------------------------------
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final video = _video;
    if (video == null) return;
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      // Background, a call, the lock screen — unless the player continues in Picture-in-Picture.
      if (!PictureInPicture.active) unawaited(video.pause());
      unawaited(_tracker?.saveProgress());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hideTimer?.cancel();
    _ticker?.cancel();
    _bufferTimer?.cancel();
    _countdownTimer?.cancel();
    unawaited(_tracker?.stop());
    unawaited(_meter?.stop());
    PictureInPicture.setPlaying(false);
    _video?.removeListener(_onVideo);
    unawaited(_video?.dispose());
    unawaited(_intro?.dispose());
    unawaited(_exitFullScreen());
    super.dispose();
  }

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/home');
    }
  }

  // -- UI ------------------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return PopScope(
      child: Scaffold(
        backgroundColor: Colors.black,
        body: ValueListenableBuilder<bool>(
          valueListenable: PictureInPicture.activeListenable,
          builder: (context, pip, _) {
            if (pip && _video != null) {
              return Center(
                child: AspectRatio(aspectRatio: _video!.value.aspectRatio, child: VideoPlayer(_video!)),
              );
            }
            return switch (_phase) {
              _Phase.loading => const LoaderScreen(label: 'Starting…'),
              _Phase.intro => _IntroView(
                controller: _intro!,
                onSkip: _endIntro,
                skipAfter: Duration(milliseconds: _config.integer('intro.skip_after_ms', 1500)),
                skippable: _config.flag('intro.skippable', true),
              ),
              _Phase.error => _Message(
                title: "We couldn't play this",
                body: _error?.message,
                action: 'Try again',
                onAction: () {
                  setState(() => _phase = _Phase.loading);
                  unawaited(_load());
                },
                onClose: _close,
              ),
              _Phase.limit => _Message(
                title: "You've used your viewing time",
                body: _error?.message ?? 'Change plan to keep watching, or come back when your allowance resets.',
                action: 'See plans',
                onAction: () => context.pushReplacement('/plans?from=player'),
                onClose: _close,
              ),
              _ => _buildPlayer(context),
            };
          },
        ),
      ),
    );
  }

  Widget _buildPlayer(BuildContext context) {
    final video = _video!;
    final v = video.value;
    final info = _info!;
    final position = v.position.inMilliseconds / 1000;
    final duration = v.duration.inMilliseconds / 1000;
    final ep = info.episode;
    final inIntro =
        ep?.introStart != null && ep?.introEnd != null && position >= ep!.introStart! && position < ep.introEnd! - 1;
    final creditsAt = ep?.creditsStart ?? (duration - _config.integer('playback.credits_fallback_seconds', 30));
    final showNext = info.next != null && duration > 0 && position >= creditsAt && !_nextDismissed;
    final label = ep == null ? info.title.title : '${info.title.title}  S${ep.seasonNumber}:E${ep.number} ${ep.name}';

    return Stack(
      fit: StackFit.expand,
      children: [
        Center(
          child: AspectRatio(aspectRatio: v.aspectRatio, child: VideoPlayer(video)),
        ),
        if (v.caption.text.isNotEmpty)
          Positioned(
            left: 48,
            right: 48,
            bottom: _controls ? 96 : 32,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                color: Colors.black.withValues(alpha: 0.6),
                child: Text(
                  v.caption.text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 18, color: Colors.white, height: 1.3),
                ),
              ),
            ),
          ),
        // Gestures: tap toggles controls; double-tap the sides seeks ±10 s; vertical swipes set
        // brightness (left) and volume (right).
        if (!_locked)
          Row(
            children: [
              for (final forward in [false, true])
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _toggleControls,
                    onDoubleTap: () =>
                        _seekBy((forward ? 1 : -1) * _config.integer('playback.seek_step_seconds', 10).toDouble()),
                    onVerticalDragStart: (_) async {
                      _gestureBrightness = !forward;
                      final level = _gestureBrightness
                          ? await ScreenBrightness.instance.application.catchError((_) => 0.5)
                          : await VolumeController.instance.getVolume().catchError((_) => 0.5);
                      setState(() => _gestureLevel = level);
                    },
                    onVerticalDragUpdate: (d) {
                      final level = ((_gestureLevel ?? 0.5) - d.delta.dy / 250).clamp(0.0, 1.0);
                      setState(() => _gestureLevel = level);
                      if (_gestureBrightness) {
                        unawaited(ScreenBrightness.instance.setApplicationScreenBrightness(level).catchError((_) {}));
                      } else {
                        unawaited(VolumeController.instance.setVolume(level).catchError((_) {}));
                      }
                    },
                    onVerticalDragEnd: (_) => Timer(
                      const Duration(milliseconds: 600),
                      () => mounted ? setState(() => _gestureLevel = null) : null,
                    ),
                  ),
                ),
            ],
          ),
        if (_ripple != null)
          _SeekRipple(
            key: ValueKey(_ripple!.key),
            forward: _ripple!.forward,
            step: _config.integer('playback.seek_step_seconds', 10),
          ),
        if (_gestureLevel != null)
          Positioned(
            top: 24,
            left: 0,
            right: 0,
            child: Center(
              child: _LevelPill(brightness: _gestureBrightness, level: _gestureLevel!),
            ),
          ),
        if (_buffering)
          const Center(
            child: NetflyLoader(label: 'Buffering…', delay: Duration.zero),
          ),
        // Controls.
        if (_locked)
          Positioned(
            top: 16,
            left: 16,
            child: SafeArea(
              child: CircleIconButton(
                icon: Icons.lock_open_rounded,
                label: 'Unlock controls',
                onPressed: () => setState(() {
                  _locked = false;
                  _controls = true;
                }),
              ),
            ),
          )
        else
          IgnorePointer(
            ignoring: !_controls,
            child: AnimatedOpacity(
              opacity: _controls ? 1 : 0,
              duration: NetflyMotion.base,
              child: _Controls(
                label: label,
                playing: v.isPlaying,
                position: position,
                duration: duration,
                buffered: v.buffered.isEmpty ? 0 : v.buffered.last.end.inMilliseconds / 1000,
                thumbs: _thumbs,
                markers: [
                  if (ep?.introStart != null && ep?.introEnd != null) (ep!.introStart!, ep.introEnd!),
                  if (ep?.creditsStart != null) (ep!.creditsStart!, duration),
                ],
                onBack: _close,
                onPlayPause: _togglePlay,
                onSeek: (s) async {
                  await _seekTo(s);
                  _scheduleHide();
                },
                onScrubStart: () => _hideTimer?.cancel(),
                onLock: () => setState(() {
                  _locked = true;
                  _controls = false;
                }),
                onEpisodes: info.episode == null
                    ? null
                    : () => showEpisodeDrawer(
                        context,
                        slug: widget.slug,
                        season: info.episode!.seasonNumber,
                        current: info.episode!.id,
                        onPick: (id) => context.pushReplacement('/watch/${widget.slug}?episode=$id'),
                      ),
                onNext: info.next == null ? null : _playNext,
                onSettings: () => _showSettings(context),
                onPip: PictureInPicture.supported ? () => PictureInPicture.enter(v.aspectRatio) : null,
              ),
            ),
          ),
        if (!_locked && inIntro && _phase == _Phase.playing)
          Positioned(
            right: 24,
            bottom: 96,
            child: NetflyButton(
              label: 'Skip Intro',
              variant: NetflyButtonVariant.secondary,
              onPressed: () => _seekTo(ep.introEnd!),
            ),
          ),
        if (!_locked && showNext && _phase == _Phase.playing)
          Positioned(
            right: 24,
            bottom: 96,
            child: NetflyButton(
              label: 'Next Episode',
              icon: Icons.skip_next_rounded,
              variant: NetflyButtonVariant.play,
              onPressed: _playNext,
            ),
          ),
        if (_phase == _Phase.ended)
          _EndCard(
            info: info,
            countdown: _countdown,
            onNext: info.next == null ? null : _playNext,
            onCancel: () {
              _countdownTimer?.cancel();
              setState(() {
                _nextDismissed = true;
                _countdown = null;
              });
            },
            onClose: _close,
          ),
        if (_askStillWatching)
          _Message(
            title: 'Are you still watching ${info.title.title}?',
            action: 'Continue watching',
            onAction: () {
              _autoplayChain = 0;
              setState(() => _askStillWatching = false);
              _startContent();
            },
            onClose: _close,
          ),
        if (_toast != null)
          Positioned(
            top: 24,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(6)),
                child: Text(_toast!),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _showSettings(BuildContext context) async {
    _hideTimer?.cancel();
    final heights = _info!.renditions.map((r) => r.height).toSet().toList()..sort((a, b) => b.compareTo(a));
    await showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: const Color(0xF0181818),
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: StatefulBuilder(
            builder: (context, setSheet) => Wrap(
              spacing: 32,
              runSpacing: 16,
              children: [
                _SettingsColumn(
                  title: 'Subtitles',
                  options: [
                    ('Off', _subtitle == null),
                    for (final t in _subtitleTracks) (t.label, _subtitle?.uri == t.uri),
                  ],
                  onPick: (i) async {
                    await _setSubtitle(i == 0 ? null : _subtitleTracks[i - 1]);
                    setSheet(() {});
                  },
                ),
                _SettingsColumn(
                  title: 'Quality',
                  options: [('Auto', _maxHeight == null), for (final h in heights) ('${h}p', _maxHeight == h)],
                  onPick: (i) async {
                    await _setQuality(i == 0 ? null : heights[i - 1]);
                    _showToast(i == 0 ? 'Quality: Auto' : 'Quality: ${heights[i - 1]}p');
                    setSheet(() {});
                  },
                ),
                _SettingsColumn(
                  title: 'Speed',
                  options: [
                    for (final s in const [0.5, 0.75, 1.0, 1.25, 1.5]) ('${s}x', _speed == s),
                  ],
                  onPick: (i) async {
                    _speed = const [0.5, 0.75, 1.0, 1.25, 1.5][i];
                    await _video?.setPlaybackSpeed(_speed);
                    setSheet(() {});
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
    _scheduleHide();
  }
}

class _Controls extends StatelessWidget {
  const _Controls({
    required this.label,
    required this.playing,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.thumbs,
    required this.markers,
    required this.onBack,
    required this.onPlayPause,
    required this.onSeek,
    required this.onScrubStart,
    required this.onLock,
    required this.onSettings,
    this.onEpisodes,
    this.onNext,
    this.onPip,
  });

  final String label;
  final bool playing;
  final double position;
  final double duration;
  final double buffered;
  final List<ThumbCue> thumbs;
  final List<(double, double)> markers;
  final VoidCallback onBack;
  final VoidCallback onPlayPause;
  final ValueChanged<double> onSeek;
  final VoidCallback onScrubStart;
  final VoidCallback onLock;
  final VoidCallback onSettings;
  final VoidCallback? onEpisodes;
  final VoidCallback? onNext;
  final VoidCallback? onPip;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xB3000000), Color(0x00000000), Color(0x00000000), Color(0xCC000000)],
          stops: [0, 0.25, 0.6, 1],
        ),
      ),
      child: SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: 4,
              left: 4,
              right: 4,
              child: Row(
                children: [
                  IconButton(onPressed: onBack, tooltip: 'Back', icon: const Icon(Icons.arrow_back_rounded, size: 28)),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: NetflyType.body.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (onPip != null)
                    IconButton(
                      onPressed: onPip,
                      tooltip: 'Picture in picture',
                      icon: const Icon(Icons.picture_in_picture_alt_rounded),
                    ),
                  IconButton(onPressed: onLock, tooltip: 'Lock controls', icon: const Icon(Icons.lock_outline_rounded)),
                ],
              ),
            ),
            Center(
              child: Semantics(
                button: true,
                label: playing ? 'Pause' : 'Play',
                child: InkResponse(
                  onTap: onPlayPause,
                  radius: 44,
                  child: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, size: 72),
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 4,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Scrubber(
                    position: position,
                    duration: duration,
                    buffered: buffered,
                    thumbs: thumbs,
                    markers: markers,
                    onSeek: onSeek,
                    onStart: onScrubStart,
                  ),
                  Row(
                    children: [
                      if (onEpisodes != null)
                        TextButton.icon(
                          onPressed: onEpisodes,
                          icon: const Icon(Icons.video_library_outlined),
                          label: const Text('Episodes'),
                        ),
                      TextButton.icon(
                        onPressed: onSettings,
                        icon: const Icon(Icons.subtitles_outlined),
                        label: const Text('Audio & Subtitles'),
                      ),
                      const Spacer(),
                      if (onNext != null)
                        TextButton.icon(
                          onPressed: onNext,
                          icon: const Icon(Icons.skip_next_rounded),
                          label: const Text('Next Episode'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsColumn extends StatelessWidget {
  const _SettingsColumn({required this.title, required this.options, required this.onPick});

  final String title;
  final List<(String, bool)> options;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 180,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: NetflyType.h3),
        const SizedBox(height: 8),
        for (var i = 0; i < options.length; i++)
          InkWell(
            onTap: () => onPick(i),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  SizedBox(width: 24, child: options[i].$2 ? const Icon(Icons.check_rounded, size: 18) : null),
                  Text(
                    options[i].$1,
                    style: NetflyType.body.copyWith(color: options[i].$2 ? Colors.white : Colors.white70),
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}

class _SeekRipple extends StatefulWidget {
  const _SeekRipple({super.key, required this.forward, required this.step});
  final bool forward;
  final int step;

  @override
  State<_SeekRipple> createState() => _SeekRippleState();
}

class _SeekRippleState extends State<_SeekRipple> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 650))
    ..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: AnimatedBuilder(
      animation: _c,
      builder: (context, _) => Align(
        alignment: widget.forward ? Alignment.centerRight : Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: 0.4,
          heightFactor: 1,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12 * (1 - _c.value)),
              borderRadius: BorderRadius.horizontal(
                left: widget.forward ? const Radius.circular(400) : Radius.zero,
                right: widget.forward ? Radius.zero : const Radius.circular(400),
              ),
            ),
            child: Center(
              child: Opacity(
                opacity: 1 - _c.value,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(widget.forward ? Icons.fast_forward_rounded : Icons.fast_rewind_rounded, size: 36),
                    Text('${widget.step} seconds', style: NetflyType.meta),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _LevelPill extends StatelessWidget {
  const _LevelPill({required this.brightness, required this.level});
  final bool brightness;
  final double level;

  @override
  Widget build(BuildContext context) => Container(
    width: 180,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(999)),
    child: Row(
      children: [
        Icon(brightness ? Icons.brightness_6_rounded : Icons.volume_up_rounded, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: LinearProgressIndicator(
            value: level,
            color: Colors.white,
            backgroundColor: Colors.white24,
            minHeight: 3,
          ),
        ),
      ],
    ),
  );
}

class _IntroView extends StatefulWidget {
  const _IntroView({required this.controller, required this.onSkip, required this.skipAfter, required this.skippable});

  final VideoPlayerController controller;
  final VoidCallback onSkip;
  final Duration skipAfter;
  final bool skippable;

  @override
  State<_IntroView> createState() => _IntroViewState();
}

class _IntroViewState extends State<_IntroView> {
  bool _canSkip = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.skippable) _timer = Timer(widget.skipAfter, () => mounted ? setState(() => _canSkip = true) : null);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      Center(
        child: AspectRatio(aspectRatio: widget.controller.value.aspectRatio, child: VideoPlayer(widget.controller)),
      ),
      if (_canSkip)
        Positioned(
          right: 24,
          bottom: 24,
          child: SafeArea(
            child: NetflyButton(label: 'Skip', variant: NetflyButtonVariant.secondary, onPressed: widget.onSkip),
          ),
        ),
    ],
  );
}

class _EndCard extends StatelessWidget {
  const _EndCard({
    required this.info,
    required this.countdown,
    required this.onNext,
    required this.onCancel,
    required this.onClose,
  });

  final Playback info;
  final int? countdown;
  final VoidCallback? onNext;
  final VoidCallback onCancel;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final next = info.next;
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.75),
      child: SafeArea(
        child: Center(
          child: next == null
              ? _Message(
                  title: 'You finished ${info.title.title}',
                  action: 'Back to browsing',
                  onAction: onClose,
                  onClose: onClose,
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Next: ${next.label} ${next.name}', style: NetflyType.h3),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: 420,
                      child: Text(
                        next.synopsis,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: NetflyType.meta.copyWith(color: Colors.white70),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        NetflyButton(
                          label: countdown == null ? 'Play next episode' : 'Next episode in $countdown',
                          icon: Icons.play_arrow_rounded,
                          variant: NetflyButtonVariant.play,
                          onPressed: onNext,
                        ),
                        const SizedBox(width: 12),
                        if (countdown != null)
                          NetflyButton(label: 'Cancel', variant: NetflyButtonVariant.secondary, onPressed: onCancel),
                      ],
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.title, this.body, required this.action, required this.onAction, required this.onClose});

  final String title;
  final String? body;
  final String action;
  final VoidCallback onAction;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.black.withValues(alpha: 0.85),
    child: SafeArea(
      child: Stack(
        children: [
          Positioned(
            top: 4,
            left: 4,
            child: IconButton(
              onPressed: onClose,
              tooltip: 'Back',
              icon: const Icon(Icons.arrow_back_rounded, size: 28),
            ),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 48),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, textAlign: TextAlign.center, style: NetflyType.h3),
                  if (body != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      body!,
                      textAlign: TextAlign.center,
                      style: NetflyType.body.copyWith(color: Colors.white70),
                    ),
                  ],
                  const SizedBox(height: 18),
                  NetflyButton(label: action, onPressed: onAction),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
