// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/episode_page.dart';
import '../models/title_page.dart';
import '../models/translation.dart';

part 'titles_client.g.dart';

@RestApi()
abstract class TitlesClient {
  factory TitlesClient(Dio dio, {String? baseUrl}) = _TitlesClient;

  /// Title detail for the modal / deep link. Viewer state included when signed in.
  @GET('/api/v1/titles/{slug}')
  Future<TitlePage> titleDetail({@Path('slug') required String slug, @Query('translation') Translation? translation});

  @GET('/api/v1/titles/{slug}/seasons/{number}/episodes')
  Future<EpisodePage> titleEpisodes({
    @Path('number') required int number,
    @Path('slug') required String slug,
    @Query('limit') int? limit,
    @Query('offset') int? offset,
  });
}
