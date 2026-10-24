// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification.dart';

part 'notification_list.g.dart';

@JsonSerializable()
class NotificationList {
  const NotificationList({required this.unread, required this.results});

  factory NotificationList.fromJson(Map<String, Object?> json) => _$NotificationListFromJson(json);

  final int unread;
  final List<Notification> results;

  Map<String, Object?> toJson() => _$NotificationListToJson(this);
}
