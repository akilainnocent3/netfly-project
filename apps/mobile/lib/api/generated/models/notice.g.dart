// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notice.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Notice _$NoticeFromJson(Map<String, dynamic> json) =>
    Notice(text: json['text'] as String, at: DateTime.parse(json['at'] as String));

Map<String, dynamic> _$NoticeToJson(Notice instance) => <String, dynamic>{
  'text': instance.text,
  'at': instance.at.toIso8601String(),
};
