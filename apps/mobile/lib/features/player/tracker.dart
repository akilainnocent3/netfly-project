import 'dart:async';

import 'package:dio/dio.dart';

import '../../api/generated/models/event_batch_request.dart';
import '../../api/generated/models/event_kind_enum.dart';
import '../../api/generated/models/event_request.dart';
import '../../api/generated/models/heartbeat_request_request.dart';
import '../../api/generated/models/heartbeat_response.dart';
import '../../api/generated/models/progress_batch_request.dart';
import '../../api/generated/models/progress_update_request.dart';
import '../../api/generated/netfly_api.dart';
import '../../core/api_error.dart';

/// Reads the player's position (seconds), duration and whether content is playing.
typedef PlayerClock = ({double position, double duration, bool playing, bool buffering, double rate});

/// Saves watch progress (every `playback.progress_save_seconds`, on pause, on exit) and batches
/// playback analytics — a port of the web's `PlaybackTracker`, same cadence and rules
/// (decision 17: completion follows the latest position; the server decides).
class PlaybackTracker {
  PlaybackTracker({
    required this.api,
    required this.sessionId,
    required this.titleId,
    required this.episodeId,
    required this.clock,
    required this.progressEvery,
    required this.flushEvery,
  });

  final NetflyApi api;
  final String sessionId;
  final int titleId;
  final int? episodeId;
  final PlayerClock Function() clock;
  final Duration progressEvery;
  final Duration flushEvery;

  final _events = <EventRequest>[];
  double _watched = 0;
  DateTime? _lastTick;
  double _lastSaved = -1;
  final _timers = <Timer>[];

  void start() {
    _timers
      ..add(
        Timer.periodic(progressEvery, (_) {
          if (clock().playing) unawaited(saveProgress());
        }),
      )
      ..add(Timer.periodic(flushEvery, (_) => unawaited(flush())))
      ..add(
        Timer.periodic(const Duration(seconds: 30), (_) {
          if (clock().playing) track(EventKindEnum.heartbeat);
        }),
      );
  }

  /// Called often while playing: accumulates real watch time (not seeks or stalls).
  void tick() {
    final now = DateTime.now();
    final c = clock();
    final last = _lastTick;
    if (last != null && c.playing && !c.buffering) {
      final delta = now.difference(last).inMilliseconds / 1000 * c.rate;
      if (delta > 0 && delta < 2) _watched += delta;
    }
    _lastTick = now;
  }

  void track(EventKindEnum kind, {double? value, Map<String, Object?>? data}) {
    _events.add(
      EventRequest(
        sessionId: sessionId,
        kind: kind,
        titleId: titleId,
        episodeId: episodeId,
        position: (clock().position * 10).round() / 10,
        value: value,
        data: data,
        ts: DateTime.now().toUtc(),
      ),
    );
    if (_events.length >= 50) unawaited(flush());
  }

  Future<void> saveProgress() async {
    final c = clock();
    if (c.duration <= 0 || ((c.position - _lastSaved).abs() < 1 && _watched < 1)) return;
    final watched = _watched.clamp(0.0, 3600.0);
    _watched = 0;
    _lastSaved = c.position;
    try {
      await api.playback.playbackProgress(
        body: ProgressBatchRequest(
          updates: [
            ProgressUpdateRequest(
              titleId: titleId,
              episodeId: episodeId,
              position: c.position,
              duration: c.duration,
              watched: watched,
            ),
          ],
        ),
      );
    } catch (_) {
      // Best effort: the next save carries the newest position.
    }
  }

  Future<void> flush() async {
    if (_events.isEmpty) return;
    final batch = _events.take(200).toList();
    _events.removeRange(0, batch.length);
    try {
      await api.playback.playbackEvents(body: EventBatchRequest(events: batch));
    } catch (_) {
      // Analytics are best effort.
    }
  }

  /// Leaving the player: the last position is always saved.
  Future<void> stop() async {
    for (final t in _timers) {
      t.cancel();
    }
    await Future.wait([saveProgress(), flush()]);
  }
}

/// Reports viewing time for one metered session — the web's `UsageMeter`. Only content time is
/// reported (never the intro, pauses, seeks or buffering); the server caps what it credits.
class UsageMeter {
  UsageMeter({
    required this.api,
    required this.sessionId,
    required this.clock,
    required this.every,
    required this.onSnapshot,
    required this.renewSession,
  });

  final NetflyApi api;
  String sessionId;
  final PlayerClock Function() clock;
  final Duration every;
  final void Function(HeartbeatResponse) onSnapshot;
  final Future<String?> Function() renewSession;

  double _watched = 0;
  double _sinceSnapshot = 0;
  double? _remainingAt;
  DateTime? _lastTick;
  Timer? _timer;
  bool _inflight = false;
  bool _stopped = false;

  void start() {
    _timer = Timer.periodic(every, (_) {
      if (clock().playing) unawaited(beat(true));
    });
  }

  void tick() {
    final now = DateTime.now();
    final c = clock();
    final last = _lastTick;
    if (last != null && c.playing && !c.buffering) {
      final delta = now.difference(last).inMilliseconds / 1000;
      if (delta > 0 && delta < 2) {
        _watched += delta;
        _sinceSnapshot += delta;
      }
    }
    _lastTick = now;
  }

  /// Seconds left before the tightest limit (null: unlimited or staff).
  double? remaining() => _remainingAt == null ? null : (_remainingAt! - _sinceSnapshot).clamp(0, double.infinity);

  /// Resuming restarts the server's clock so paused time isn't measured.
  void resumed() {
    _lastTick = null;
    unawaited(beat(false));
  }

  void paused() {
    _lastTick = null;
    if (_watched > 0) unawaited(beat(true));
  }

  Future<void> beat(bool playing) async {
    if (_stopped || _inflight) return;
    final watched = _watched.clamp(0.0, 3600.0);
    _watched = 0;
    _inflight = true;
    try {
      final snapshot = await api.playback.playbackHeartbeat(
        body: HeartbeatRequestRequest(sessionId: sessionId, watched: playing ? watched : 0, playing: playing),
      );
      _remainingAt = snapshot.exempt ? null : snapshot.remainingSeconds?.toDouble();
      _sinceSnapshot = 0;
      onSnapshot(snapshot);
    } on DioException catch (e) {
      final error = ApiError.from(e);
      if (error.code == 'invalid_session') {
        final next = await renewSession();
        if (next != null) sessionId = next;
      } else {
        _watched += watched; // offline: keep it for the next beat (the server still caps it)
      }
    } finally {
      _inflight = false;
    }
  }

  Future<void> stop() async {
    if (_stopped) return;
    _timer?.cancel();
    if (_watched > 0.5) await beat(true);
    _stopped = true;
  }
}
