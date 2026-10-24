// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_enum.dart';

part 'code_sent.g.dart';

@JsonSerializable()
class CodeSent {
  const CodeSent({
    required this.channel,
    required this.target,
    required this.sentTo,
    required this.expiresIn,
    required this.resendIn,
    required this.length,
    required this.network,
  });

  factory CodeSent.fromJson(Map<String, Object?> json) => _$CodeSentFromJson(json);

  final ChannelEnum channel;
  final String target;
  @JsonKey(name: 'sent_to')
  final String sentTo;
  @JsonKey(name: 'expires_in')
  final int expiresIn;
  @JsonKey(name: 'resend_in')
  final int resendIn;
  final int length;
  final String? network;

  Map<String, Object?> toJson() => _$CodeSentToJson(this);
}
