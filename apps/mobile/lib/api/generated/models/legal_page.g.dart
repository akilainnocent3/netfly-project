// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalPage _$LegalPageFromJson(Map<String, dynamic> json) => LegalPage(
  slug: json['slug'] as String,
  title: json['title'] as String,
  updatedAt: DateTime.parse(json['updated_at'] as String),
  bodyMarkdown: json['body_markdown'] as String?,
);

Map<String, dynamic> _$LegalPageToJson(LegalPage instance) => <String, dynamic>{
  'slug': instance.slug,
  'title': instance.title,
  'body_markdown': ?instance.bodyMarkdown,
  'updated_at': instance.updatedAt.toIso8601String(),
};
