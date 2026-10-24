// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'membership.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Membership _$MembershipFromJson(Map<String, dynamic> json) => Membership(
  subscription: Subscription.fromJson(json['subscription'] as Map<String, dynamic>),
  usage: UsageSnapshot.fromJson(json['usage'] as Map<String, dynamic>),
  trial: TrialInfo.fromJson(json['trial'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MembershipToJson(Membership instance) => <String, dynamic>{
  'subscription': instance.subscription,
  'usage': instance.usage,
  'trial': instance.trial,
};
