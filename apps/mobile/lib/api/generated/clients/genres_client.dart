// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/genre_page.dart';
import '../models/genre_tile.dart';
import '../models/sort.dart';
import '../models/translation.dart';

part 'genres_client.g.dart';

@RestApi()
abstract class GenresClient {
  factory GenresClient(Dio dio, {String? baseUrl}) = _GenresClient;

  @GET('/api/v1/genres')
  Future<List<GenreTile>> genres({@Query('translation') Translation? translation});

  @GET('/api/v1/genres/{slug}/titles')
  Future<GenrePage> genreTitles({
    @Path('slug') required String slug,
    @Query('cursor') String? cursor,
    @Query('sort') Sort? sort,
    @Query('translation') Translation? translation,
  });
}
