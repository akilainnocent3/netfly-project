// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'choose_plan_request.g.dart';

@JsonSerializable()
class ChoosePlanRequest {
  const ChoosePlanRequest({required this.plan, this.trial = false});

  factory ChoosePlanRequest.fromJson(Map<String, Object?> json) => _$ChoosePlanRequestFromJson(json);

  final String plan;
  final bool trial;

  Map<String, Object?> toJson() => _$ChoosePlanRequestToJson(this);
}
