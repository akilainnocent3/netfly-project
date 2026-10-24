// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'subscription.dart';
import 'trial_info.dart';
import 'usage_snapshot.dart';

part 'membership.g.dart';

@JsonSerializable()
class Membership {
  const Membership({required this.subscription, required this.usage, required this.trial});

  factory Membership.fromJson(Map<String, Object?> json) => _$MembershipFromJson(json);

  final Subscription subscription;
  final UsageSnapshot usage;
  final TrialInfo trial;

  Map<String, Object?> toJson() => _$MembershipToJson(this);
}
