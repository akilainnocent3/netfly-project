// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_list.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationList _$NotificationListFromJson(Map<String, dynamic> json) => NotificationList(
  unread: (json['unread'] as num).toInt(),
  results: (json['results'] as List<dynamic>).map((e) => Notification.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$NotificationListToJson(NotificationList instance) => <String, dynamic>{
  'unread': instance.unread,
  'results': instance.results,
};
