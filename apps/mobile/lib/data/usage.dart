import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/generated/models/heartbeat_response.dart';
import '../api/generated/models/usage_scope_enum.dart';
import '../api/generated/models/usage_snapshot.dart';
import '../core/http.dart';
import '../core/public_config.dart';
import '../core/session.dart';

/// Where the viewer stands, reduced to the one window that matters right now: the tightest one
/// while watching, or — once a limit is hit — the one that has to reset before playback returns.
class UsageView {
  const UsageView({
    required this.scope,
    required this.used,
    required this.limit,
    required this.reached,
    required this.resetsAt,
  });

  final UsageScopeEnum scope;
  final int used;
  final int limit;
  final bool reached;
  final DateTime resetsAt;

  int get remaining => (limit - used).clamp(0, limit);
  double get fraction => limit <= 0 ? 1 : (used / limit).clamp(0.0, 1.0);
}

/// Null when the viewer isn't metered (staff, or a plan with no limits).
UsageView? usageView(UsageSnapshot s) {
  if (s.exempt) return null;
  final windows = [
    for (final scope in [UsageScopeEnum.day, UsageScopeEnum.week, UsageScopeEnum.month])
      if (_limit(s, scope) case final limit?)
        UsageView(
          scope: scope,
          used: _used(s, scope),
          limit: limit,
          reached: (_remaining(s, scope) ?? 1) <= 0,
          resetsAt: _resets(s, scope),
        ),
  ];
  if (windows.isEmpty) return null;
  // Blocked: playback comes back when the last blocking window resets.
  final blocking = windows.where((w) => w.reached).toList()..sort((a, b) => b.resetsAt.compareTo(a.resetsAt));
  if (blocking.isNotEmpty) return blocking.first;
  windows.sort((a, b) {
    final byLeft = a.remaining.compareTo(b.remaining);
    return byLeft != 0 ? byLeft : b.fraction.compareTo(a.fraction);
  });
  return windows.first;
}

int? _limit(UsageSnapshot s, UsageScopeEnum scope) => switch (scope) {
  UsageScopeEnum.day => s.limits.day,
  UsageScopeEnum.week => s.limits.week,
  UsageScopeEnum.month => s.limits.month,
  _ => null,
};

int _used(UsageSnapshot s, UsageScopeEnum scope) =>
    switch (scope) {
      UsageScopeEnum.day => s.used.day,
      UsageScopeEnum.week => s.used.week,
      UsageScopeEnum.month => s.used.month,
      _ => null,
    } ??
    0;

int? _remaining(UsageSnapshot s, UsageScopeEnum scope) => switch (scope) {
  UsageScopeEnum.day => s.remaining.day,
  UsageScopeEnum.week => s.remaining.week,
  UsageScopeEnum.month => s.remaining.month,
  _ => null,
};

DateTime _resets(UsageSnapshot s, UsageScopeEnum scope) => switch (scope) {
  UsageScopeEnum.week => s.resetsAt.week,
  UsageScopeEnum.month => s.resetsAt.month,
  _ => s.resetsAt.day,
};

/// Every window with a limit, for the detail sheet: (scope, used, limit, resets at).
List<UsageView> usageWindows(UsageSnapshot s) => [
  for (final scope in [UsageScopeEnum.day, UsageScopeEnum.week, UsageScopeEnum.month])
    if (!s.exempt && _limit(s, scope) != null)
      UsageView(
        scope: scope,
        used: _used(s, scope),
        limit: _limit(s, scope)!,
        reached: (_remaining(s, scope) ?? 1) <= 0,
        resetsAt: _resets(s, scope),
      ),
];

/// How far the wait for a reset has come (0 at the moment the limit was hit, 1 at reset).
double resetProgress(DateTime reachedAt, DateTime resetsAt, DateTime now) {
  final total = resetsAt.difference(reachedAt).inMilliseconds;
  if (total <= 0) return 1;
  return (now.difference(reachedAt).inMilliseconds / total).clamp(0.0, 1.0);
}

class UsageState {
  const UsageState({required this.snapshot, this.reachedAt});

  final UsageSnapshot snapshot;

  /// When this device first saw the current limit hit (the reset ring starts from here).
  final DateTime? reachedAt;

  UsageView? get view => usageView(snapshot);
}

const _reachedKey = 'netfly.usage_reached.v1';

/// The viewer's allowance, live: fetched on sign-in, re-synced every minute while the app is in
/// the foreground and right after a window resets, and fed by the player's heartbeats.
class UsageController extends AsyncNotifier<UsageState?> {
  Timer? _poll;
  Timer? _reset;
  AppLifecycleListener? _lifecycle;

  @override
  Future<UsageState?> build() async {
    ref.onDispose(_stop);
    if (ref.watch(userProvider) == null) return null;
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => unawaited(refresh()));
    _lifecycle = AppLifecycleListener(onResume: () => unawaited(refresh()));
    return _wrap(await ref.read(apiProvider).billing.billingUsage());
  }

  void _stop() {
    _poll?.cancel();
    _reset?.cancel();
    _lifecycle?.dispose();
  }

  /// Re-sync quietly: a failed request keeps what's shown.
  Future<void> refresh() async {
    if (ref.read(userProvider) == null) return;
    try {
      state = AsyncData(_wrap(await ref.read(apiProvider).billing.billingUsage()));
    } catch (_) {}
  }

  /// A snapshot the player already has (every heartbeat).
  void push(HeartbeatResponse s) => state = AsyncData(
    _wrap(
      UsageSnapshot(
        plan: s.plan,
        notice: s.notice,
        exempt: s.exempt,
        allowed: s.allowed,
        limitReached: s.limitReached,
        limits: s.limits,
        used: s.used,
        remaining: s.remaining,
        remainingSeconds: s.remainingSeconds,
        resetsAt: s.resetsAt,
        warnAtMinutes: s.warnAtMinutes,
        heartbeatSeconds: s.heartbeatSeconds,
        serverTime: s.serverTime,
      ),
    ),
  );

  UsageState _wrap(UsageSnapshot snapshot) {
    final view = usageView(snapshot);
    _reset?.cancel();
    if (view == null) return UsageState(snapshot: snapshot);
    // Ask again just after the window turns over, so the ring closes on time. A reset already
    // behind this device's clock is left to the minute poll (no tight refetch loop on skew).
    final wait = view.resetsAt.difference(DateTime.now()) + const Duration(seconds: 2);
    if (wait > Duration.zero && wait < const Duration(days: 2)) _reset = Timer(wait, refresh);
    return UsageState(snapshot: snapshot, reachedAt: view.reached ? _reachedAt(view.resetsAt) : null);
  }

  DateTime _reachedAt(DateTime resetsAt) {
    final prefs = ref.read(sharedPreferencesProvider);
    try {
      final saved = Map<String, Object?>.from(jsonDecode(prefs.getString(_reachedKey) ?? '{}') as Map);
      if (saved['resets'] == resetsAt.toIso8601String()) return DateTime.parse(saved['at']! as String);
    } catch (_) {}
    final now = DateTime.now();
    unawaited(
      prefs.setString(_reachedKey, jsonEncode({'resets': resetsAt.toIso8601String(), 'at': now.toIso8601String()})),
    );
    return now;
  }
}

final usageProvider = AsyncNotifierProvider<UsageController, UsageState?>(UsageController.new);
