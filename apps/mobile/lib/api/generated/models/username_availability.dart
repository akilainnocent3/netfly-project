// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'username_availability.g.dart';

@JsonSerializable()
class UsernameAvailability {
  const UsernameAvailability({required this.username, required this.available, required this.message});

  factory UsernameAvailability.fromJson(Map<String, Object?> json) => _$UsernameAvailabilityFromJson(json);

  final String username;
  final bool available;
  final String message;

  Map<String, Object?> toJson() => _$UsernameAvailabilityToJson(this);
}
