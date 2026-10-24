// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'auto_renew_request.g.dart';

@JsonSerializable()
class AutoRenewRequest {
  const AutoRenewRequest({required this.onValue});

  factory AutoRenewRequest.fromJson(Map<String, Object?> json) => _$AutoRenewRequestFromJson(json);

  /// The name has been replaced because it contains a keyword. Original name: `on`.
  @JsonKey(name: 'on')
  final bool onValue;

  Map<String, Object?> toJson() => _$AutoRenewRequestToJson(this);
}
