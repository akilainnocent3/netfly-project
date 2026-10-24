// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

part 'continue_watching_client.g.dart';

@RestApi()
abstract class ContinueWatchingClient {
  factory ContinueWatchingClient(Dio dio, {String? baseUrl}) = _ContinueWatchingClient;

  /// "Remove from row": hides the title from Continue Watching until it is played again.
  @DELETE('/api/v1/continue-watching/{title_id}')
  Future<void> continueWatchingRemove({@Path('title_id') required int titleId});
}
