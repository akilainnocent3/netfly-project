// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/catalog.dart';
import '../models/landing.dart';
import '../models/sitemap.dart';

part 'public_client.g.dart';

@RestApi()
abstract class PublicClient {
  factory PublicClient(Dio dio, {String? baseUrl}) = _PublicClient;

  /// `/.well-known/apple-app-site-association`; 404 until the iOS app ID is configured.
  @GET('/api/v1/public/apple-app-site-association')
  Future<dynamic> publicAppleAppSiteAssociation();

  /// `/.well-known/assetlinks.json`; 404 until the signing certificate is configured.
  @GET('/api/v1/public/assetlinks.json')
  Future<dynamic> publicAssetlinks();

  /// Every published title A–Z, paginated: the crawlable catalogue behind /titles.
  @GET('/api/v1/public/catalog')
  Future<Catalog> publicCatalog({@Query('page') int? page});

  /// The IndexNow key file (`/<key>.txt` on the site, rewritten here); 404 unless configured.
  @GET('/api/v1/public/indexnow/{key}')
  Future<String> publicIndexnowKey({@Path('key') required String key});

  /// Signed-out landing page: today's Top 10 and the genre directory (crawl paths).
  @GET('/api/v1/public/landing')
  Future<Landing> publicLanding();

  /// Every public URL's slug and last-modified time (the client renders sitemap.xml).
  @GET('/api/v1/public/sitemap')
  Future<Sitemap> publicSitemap();
}
