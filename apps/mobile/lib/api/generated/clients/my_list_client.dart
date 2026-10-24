// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/title_card.dart';
import '../models/translation.dart';

part 'my_list_client.g.dart';

@RestApi()
abstract class MyListClient {
  factory MyListClient(Dio dio, {String? baseUrl}) = _MyListClient;

  @GET('/api/v1/my-list')
  Future<List<TitleCard>> myList({@Query('translation') Translation? translation});

  @PUT('/api/v1/my-list/{title_id}')
  Future<void> myListAdd({@Path('title_id') required int titleId});

  @DELETE('/api/v1/my-list/{title_id}')
  Future<void> myListRemove({@Path('title_id') required int titleId});
}
