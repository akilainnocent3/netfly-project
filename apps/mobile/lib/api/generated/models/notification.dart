// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification_kind_enum.dart';
import 'title_card.dart';

part 'notification.g.dart';

@JsonSerializable()
class Notification {
  const Notification({
    required this.id,
    required this.kind,
    required this.message,
    required this.at,
    required this.unread,
    required this.title,
  });

  factory Notification.fromJson(Map<String, Object?> json) => _$NotificationFromJson(json);

  final String id;
  final NotificationKindEnum kind;
  final String message;
  final DateTime at;
  final bool unread;
  final TitleCard title;

  Map<String, Object?> toJson() => _$NotificationToJson(this);
}
