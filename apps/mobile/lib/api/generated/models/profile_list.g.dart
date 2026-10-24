// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'profile_list.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProfileList _$ProfileListFromJson(Map<String, dynamic> json) => ProfileList(
  enabled: json['enabled'] as bool,
  maxProfiles: (json['max_profiles'] as num).toInt(),
  avatars: (json['avatars'] as List<dynamic>).map((e) => e as String).toList(),
  results: (json['results'] as List<dynamic>).map((e) => Profile.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$ProfileListToJson(ProfileList instance) => <String, dynamic>{
  'enabled': instance.enabled,
  'max_profiles': instance.maxProfiles,
  'avatars': instance.avatars,
  'results': instance.results,
};
