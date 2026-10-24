// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/rating_input_request.dart';
import '../models/rating_result.dart';

part 'ratings_client.g.dart';

@RestApi()
abstract class RatingsClient {
  factory RatingsClient(Dio dio, {String? baseUrl}) = _RatingsClient;

  /// One tap: 👎 -1 · 👍 1 · 👍👍 2. Recommendations react on the next request.
  @PUT('/api/v1/ratings/{title_id}')
  Future<RatingResult> rateTitle({@Path('title_id') required int titleId, @Body() required RatingInputRequest body});

  /// One tap: 👎 -1 · 👍 1 · 👍👍 2. Recommendations react on the next request.
  @DELETE('/api/v1/ratings/{title_id}')
  Future<void> unrateTitle({@Path('title_id') required int titleId});
}
