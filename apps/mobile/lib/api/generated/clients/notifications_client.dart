// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/notification_list.dart';

part 'notifications_client.g.dart';

@RestApi()
abstract class NotificationsClient {
  factory NotificationsClient(Dio dio, {String? baseUrl}) = _NotificationsClient;

  /// The bell: reminded titles that are out, new episodes of saved series, recent arrivals.
  @GET('/api/v1/notifications')
  Future<NotificationList> notifications();

  @POST('/api/v1/notifications/seen')
  Future<void> notificationsSeen();
}
