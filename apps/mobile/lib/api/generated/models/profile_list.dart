// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'profile.dart';

part 'profile_list.g.dart';

@JsonSerializable()
class ProfileList {
  const ProfileList({required this.enabled, required this.maxProfiles, required this.avatars, required this.results});

  factory ProfileList.fromJson(Map<String, Object?> json) => _$ProfileListFromJson(json);

  final bool enabled;
  @JsonKey(name: 'max_profiles')
  final int maxProfiles;
  final List<String> avatars;
  final List<Profile> results;

  Map<String, Object?> toJson() => _$ProfileListToJson(this);
}
