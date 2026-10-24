// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'usage_snapshot.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsageSnapshot _$UsageSnapshotFromJson(Map<String, dynamic> json) => UsageSnapshot(
  plan: UsagePlan.fromJson(json['plan'] as Map<String, dynamic>),
  notice: json['notice'] == null ? null : Notice.fromJson(json['notice'] as Map<String, dynamic>),
  exempt: json['exempt'] as bool,
  allowed: json['allowed'] as bool,
  limitReached: json['limit_reached'] == null ? null : UsageScopeEnum.fromJson(json['limit_reached'] as String),
  limits: UsageWindows.fromJson(json['limits'] as Map<String, dynamic>),
  used: UsageWindows.fromJson(json['used'] as Map<String, dynamic>),
  remaining: UsageWindows.fromJson(json['remaining'] as Map<String, dynamic>),
  remainingSeconds: (json['remaining_seconds'] as num?)?.toInt(),
  resetsAt: Resets.fromJson(json['resets_at'] as Map<String, dynamic>),
  warnAtMinutes: (json['warn_at_minutes'] as List<dynamic>).map((e) => (e as num).toInt()).toList(),
  heartbeatSeconds: (json['heartbeat_seconds'] as num).toInt(),
  serverTime: DateTime.parse(json['server_time'] as String),
);

Map<String, dynamic> _$UsageSnapshotToJson(UsageSnapshot instance) => <String, dynamic>{
  'plan': instance.plan,
  'notice': ?instance.notice,
  'exempt': instance.exempt,
  'allowed': instance.allowed,
  'limit_reached': ?instance.limitReached,
  'limits': instance.limits,
  'used': instance.used,
  'remaining': instance.remaining,
  'remaining_seconds': ?instance.remainingSeconds,
  'resets_at': instance.resetsAt,
  'warn_at_minutes': instance.warnAtMinutes,
  'heartbeat_seconds': instance.heartbeatSeconds,
  'server_time': instance.serverTime.toIso8601String(),
};
