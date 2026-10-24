// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'related_term_kind_enum.dart';

part 'related_term.g.dart';

@JsonSerializable()
class RelatedTerm {
  const RelatedTerm({required this.label, required this.kind});

  factory RelatedTerm.fromJson(Map<String, Object?> json) => _$RelatedTermFromJson(json);

  final String label;
  final RelatedTermKindEnum kind;

  Map<String, Object?> toJson() => _$RelatedTermToJson(this);
}
