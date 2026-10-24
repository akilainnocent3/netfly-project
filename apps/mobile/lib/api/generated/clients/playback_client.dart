// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/event_batch_request.dart';
import '../models/heartbeat_request_request.dart';
import '../models/heartbeat_response.dart';
import '../models/playback.dart';
import '../models/progress_batch_request.dart';
import '../models/progress_result.dart';

part 'playback_client.g.dart';

@RestApi()
abstract class PlaybackClient {
  factory PlaybackClient(Dio dio, {String? baseUrl}) = _PlaybackClient;

  @GET('/api/v1/playback/{slug}')
  Future<Playback> playback({
    @Path('slug') required String slug,
    @Query('episode') int? episode,
    @Query('preview') bool? preview,
  });

  /// Playback analytics in batches. Buffered in Redis, bulk-inserted by a periodic task.
  @POST('/api/v1/playback/events')
  Future<void> playbackEvents({@Body() required EventBatchRequest body});

  /// The player reports viewing time; the server decides what counts (see usage.heartbeat).
  @POST('/api/v1/playback/heartbeat')
  Future<HeartbeatResponse> playbackHeartbeat({@Body() required HeartbeatRequestRequest body});

  /// Saves position for one or more items (the player calls this every N seconds and on pause/exit).
  @POST('/api/v1/playback/progress')
  Future<ProgressResult> playbackProgress({@Body() required ProgressBatchRequest body});
}
