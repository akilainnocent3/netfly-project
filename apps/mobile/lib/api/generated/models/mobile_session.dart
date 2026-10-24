// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user.dart';

part 'mobile_session.g.dart';

/// The web's session, with the refresh token in the body instead of an httpOnly cookie.
@JsonSerializable()
class MobileSession {
  const MobileSession({required this.access, required this.expiresIn, required this.refresh, required this.user});

  factory MobileSession.fromJson(Map<String, Object?> json) => _$MobileSessionFromJson(json);

  final String access;
  @JsonKey(name: 'expires_in')
  final int expiresIn;
  final String refresh;
  final User user;

  Map<String, Object?> toJson() => _$MobileSessionToJson(this);
}
