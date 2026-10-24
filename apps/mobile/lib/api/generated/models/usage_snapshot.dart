// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notice.dart';
import 'resets.dart';
import 'usage_plan.dart';
import 'usage_scope_enum.dart';
import 'usage_windows.dart';

part 'usage_snapshot.g.dart';

@JsonSerializable()
class UsageSnapshot {
  const UsageSnapshot({
    required this.plan,
    required this.notice,
    required this.exempt,
    required this.allowed,
    required this.limitReached,
    required this.limits,
    required this.used,
    required this.remaining,
    required this.remainingSeconds,
    required this.resetsAt,
    required this.warnAtMinutes,
    required this.heartbeatSeconds,
    required this.serverTime,
  });

  factory UsageSnapshot.fromJson(Map<String, Object?> json) => _$UsageSnapshotFromJson(json);

  final UsagePlan plan;
  final Notice? notice;
  final bool exempt;
  final bool allowed;
  @JsonKey(name: 'limit_reached')
  final UsageScopeEnum? limitReached;
  final UsageWindows limits;
  final UsageWindows used;
  final UsageWindows remaining;
  @JsonKey(name: 'remaining_seconds')
  final int? remainingSeconds;
  @JsonKey(name: 'resets_at')
  final Resets resetsAt;
  @JsonKey(name: 'warn_at_minutes')
  final List<int> warnAtMinutes;
  @JsonKey(name: 'heartbeat_seconds')
  final int heartbeatSeconds;
  @JsonKey(name: 'server_time')
  final DateTime serverTime;

  Map<String, Object?> toJson() => _$UsageSnapshotToJson(this);
}
