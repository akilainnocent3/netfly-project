// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'row.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Row _$RowFromJson(Map<String, dynamic> json) => Row(
  key: json['key'] as String,
  kind: json['kind'] as String,
  title: json['title'] as String,
  items: (json['items'] as List<dynamic>).map((e) => TitleCard.fromJson(e as Map<String, dynamic>)).toList(),
  seed: json['seed'] as String?,
);

Map<String, dynamic> _$RowToJson(Row instance) => <String, dynamic>{
  'key': instance.key,
  'kind': instance.kind,
  'title': instance.title,
  'items': instance.items,
  'seed': ?instance.seed,
};
