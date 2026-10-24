// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

part 'reminders_client.g.dart';

@RestApi()
abstract class RemindersClient {
  factory RemindersClient(Dio dio, {String? baseUrl}) = _RemindersClient;

  /// "Remind me" on a Coming Soon title (per profile when profiles are on).
  @PUT('/api/v1/reminders/{title_id}')
  Future<void> reminderAdd({@Path('title_id') required int titleId});

  /// "Remind me" on a Coming Soon title (per profile when profiles are on).
  @DELETE('/api/v1/reminders/{title_id}')
  Future<void> reminderRemove({@Path('title_id') required int titleId});
}
