// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_enum.dart';
import 'user.dart';

part 'verified.g.dart';

@JsonSerializable()
class Verified {
  const Verified({required this.channel, required this.user});

  factory Verified.fromJson(Map<String, Object?> json) => _$VerifiedFromJson(json);

  final ChannelEnum channel;
  final User user;

  Map<String, Object?> toJson() => _$VerifiedToJson(this);
}
