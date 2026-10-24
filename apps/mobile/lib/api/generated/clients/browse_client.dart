// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/billboard_item.dart';
import '../models/home_page.dart';
import '../models/new_and_popular.dart';
import '../models/translation.dart';
import '../models/type.dart';
import '../models/upcoming.dart';

part 'browse_client.g.dart';

@RestApi()
abstract class BrowseClient {
  factory BrowseClient(Dio dio, {String? baseUrl}) = _BrowseClient;

  /// Hero billboard. Anonymous: short public cache. Signed in: computed per viewer (dislikes excluded).
  @GET('/api/v1/browse/billboard')
  Future<List<BillboardItem>> browseBillboard({
    @Query('translation') Translation? translation,
    @Query('type') Type? type,
  });

  /// One page of the infinite home feed. Signed out: the shared, non-personalised feed.
  @GET('/api/v1/browse/home')
  Future<HomePage> browseHome({
    @Query('cursor') String? cursor,
    @Query('translation') Translation? translation,
    @Query('type') Type? type,
  });

  /// New & Popular tabs: Coming soon, Everyone's watching, Top 10 series, Top 10 films.
  /// Signed out: the same lists without My List / ratings / reminders, cached publicly.
  @GET('/api/v1/browse/new-and-popular')
  Future<NewAndPopular> browseNewAndPopular({@Query('translation') Translation? translation});

  /// Public Coming Soon list (scheduled titles only). `reminded` is set when signed in.
  @GET('/api/v1/browse/upcoming')
  Future<List<Upcoming>> browseUpcoming();
}
