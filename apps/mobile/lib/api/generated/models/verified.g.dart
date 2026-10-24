// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verified.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Verified _$VerifiedFromJson(Map<String, dynamic> json) => Verified(
  channel: ChannelEnum.fromJson(json['channel'] as String),
  user: User.fromJson(json['user'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerifiedToJson(Verified instance) => <String, dynamic>{
  'channel': instance.channel,
  'user': instance.user,
};
