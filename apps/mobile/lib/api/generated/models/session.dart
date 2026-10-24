// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user.dart';

part 'session.g.dart';

@JsonSerializable()
class Session {
  const Session({required this.access, required this.expiresIn, required this.csrf, required this.user});

  factory Session.fromJson(Map<String, Object?> json) => _$SessionFromJson(json);

  final String access;
  @JsonKey(name: 'expires_in')
  final int expiresIn;
  final String csrf;
  final User user;

  Map<String, Object?> toJson() => _$SessionToJson(this);
}
