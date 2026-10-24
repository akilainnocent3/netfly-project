// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/search_response.dart';
import '../models/search_suggestions.dart';
import '../models/translation.dart';

part 'search_client.g.dart';

@RestApi()
abstract class SearchClient {
  factory SearchClient(Dio dio, {String? baseUrl}) = _SearchClient;

  /// Netflix-style search across titles, original titles, cast, directors and genres.
  /// (trigram, so typos still match), plus "Explore titles related to:" terms.
  @GET('/api/v1/search')
  Future<SearchResponse> search({@Query('q') required String q, @Query('translation') Translation? translation});

  /// Before typing: Top Searches (as titles, for the phone list) and the member's recent ones.
  @GET('/api/v1/search/suggestions')
  Future<SearchSuggestions> searchSuggestions({@Query('translation') Translation? translation});
}
