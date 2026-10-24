// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Notification _$NotificationFromJson(Map<String, dynamic> json) => Notification(
  id: json['id'] as String,
  kind: NotificationKindEnum.fromJson(json['kind'] as String),
  message: json['message'] as String,
  at: DateTime.parse(json['at'] as String),
  unread: json['unread'] as bool,
  title: TitleCard.fromJson(json['title'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NotificationToJson(Notification instance) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind,
  'message': instance.message,
  'at': instance.at.toIso8601String(),
  'unread': instance.unread,
  'title': instance.title,
};
