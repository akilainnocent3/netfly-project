// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_page.g.dart';

@JsonSerializable()
class LegalPage {
  const LegalPage({required this.slug, required this.title, required this.updatedAt, this.bodyMarkdown});

  factory LegalPage.fromJson(Map<String, Object?> json) => _$LegalPageFromJson(json);

  final String slug;
  final String title;
  @JsonKey(name: 'body_markdown')
  final String? bodyMarkdown;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$LegalPageToJson(this);
}
