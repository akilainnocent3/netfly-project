// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rendition_info.g.dart';

@JsonSerializable()
class RenditionInfo {
  const RenditionInfo({required this.height, required this.width, required this.bandwidth});

  factory RenditionInfo.fromJson(Map<String, Object?> json) => _$RenditionInfoFromJson(json);

  final int height;
  final int width;
  final int bandwidth;

  Map<String, Object?> toJson() => _$RenditionInfoToJson(this);
}
