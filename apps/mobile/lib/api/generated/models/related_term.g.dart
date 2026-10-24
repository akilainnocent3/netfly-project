// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'related_term.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RelatedTerm _$RelatedTermFromJson(Map<String, dynamic> json) =>
    RelatedTerm(label: json['label'] as String, kind: RelatedTermKindEnum.fromJson(json['kind'] as String));

Map<String, dynamic> _$RelatedTermToJson(RelatedTerm instance) => <String, dynamic>{
  'label': instance.label,
  'kind': instance.kind,
};
