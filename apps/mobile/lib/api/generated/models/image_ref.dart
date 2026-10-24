// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'image_ref.g.dart';

/// What viewers get: a loader key plus a blur placeholder.
@JsonSerializable()
class ImageRef {
  const ImageRef({required this.key, required this.blur, required this.color, this.width, this.height});

  factory ImageRef.fromJson(Map<String, Object?> json) => _$ImageRefFromJson(json);

  final String key;
  final String blur;
  final String color;
  final int? width;
  final int? height;

  Map<String, Object?> toJson() => _$ImageRefToJson(this);
}
