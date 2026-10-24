// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'checkout_start_request.g.dart';

@JsonSerializable()
class CheckoutStartRequest {
  const CheckoutStartRequest({required this.plan, this.phone, this.trial = false});

  factory CheckoutStartRequest.fromJson(Map<String, Object?> json) => _$CheckoutStartRequestFromJson(json);

  final String plan;
  final bool trial;
  final String? phone;

  Map<String, Object?> toJson() => _$CheckoutStartRequestToJson(this);
}
