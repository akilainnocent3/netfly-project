// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'code_sent.dart';

part 'contact.g.dart';

@JsonSerializable()
class Contact {
  const Contact({required this.value, required this.verified, required this.pending});

  factory Contact.fromJson(Map<String, Object?> json) => _$ContactFromJson(json);

  final String? value;
  final bool verified;
  final CodeSent? pending;

  Map<String, Object?> toJson() => _$ContactToJson(this);
}
