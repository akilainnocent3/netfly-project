// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'value_enum.dart';

part 'rating_input_request.g.dart';

@JsonSerializable()
class RatingInputRequest {
  const RatingInputRequest({required this.value});

  factory RatingInputRequest.fromJson(Map<String, Object?> json) => _$RatingInputRequestFromJson(json);

  final ValueEnum value;

  Map<String, Object?> toJson() => _$RatingInputRequestToJson(this);
}
