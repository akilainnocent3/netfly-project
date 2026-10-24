// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact.dart';

part 'verify_status.g.dart';

@JsonSerializable()
class VerifyStatus {
  const VerifyStatus({required this.email, required this.phone});

  factory VerifyStatus.fromJson(Map<String, Object?> json) => _$VerifyStatusFromJson(json);

  final Contact email;
  final Contact phone;

  Map<String, Object?> toJson() => _$VerifyStatusToJson(this);
}
