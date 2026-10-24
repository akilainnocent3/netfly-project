// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'public_config.g.dart';

@JsonSerializable()
class PublicConfig {
  const PublicConfig({required this.values});

  factory PublicConfig.fromJson(Map<String, Object?> json) => _$PublicConfigFromJson(json);

  final Map<String, dynamic> values;

  Map<String, Object?> toJson() => _$PublicConfigToJson(this);
}
