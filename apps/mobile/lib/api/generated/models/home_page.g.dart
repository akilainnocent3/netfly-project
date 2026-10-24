// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'home_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HomePage _$HomePageFromJson(Map<String, dynamic> json) => HomePage(
  rows: (json['rows'] as List<dynamic>).map((e) => Row.fromJson(e as Map<String, dynamic>)).toList(),
  next: json['next'] as String?,
);

Map<String, dynamic> _$HomePageToJson(HomePage instance) => <String, dynamic>{
  'rows': instance.rows,
  'next': ?instance.next,
};
