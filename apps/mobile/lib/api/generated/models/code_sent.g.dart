// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'code_sent.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CodeSent _$CodeSentFromJson(Map<String, dynamic> json) => CodeSent(
  channel: ChannelEnum.fromJson(json['channel'] as String),
  target: json['target'] as String,
  sentTo: json['sent_to'] as String,
  expiresIn: (json['expires_in'] as num).toInt(),
  resendIn: (json['resend_in'] as num).toInt(),
  length: (json['length'] as num).toInt(),
  network: json['network'] as String?,
);

Map<String, dynamic> _$CodeSentToJson(CodeSent instance) => <String, dynamic>{
  'channel': instance.channel,
  'target': instance.target,
  'sent_to': instance.sentTo,
  'expires_in': instance.expiresIn,
  'resend_in': instance.resendIn,
  'length': instance.length,
  'network': ?instance.network,
};
