// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';

import 'clients/api_client.dart';
import 'clients/config_client.dart';
import 'clients/auth_client.dart';
import 'clients/billing_client.dart';
import 'clients/browse_client.dart';
import 'clients/catalog_client.dart';
import 'clients/continue_watching_client.dart';
import 'clients/genres_client.dart';
import 'clients/legal_client.dart';
import 'clients/my_list_client.dart';
import 'clients/notifications_client.dart';
import 'clients/playback_client.dart';
import 'clients/profiles_client.dart';
import 'clients/public_client.dart';
import 'clients/ratings_client.dart';
import 'clients/reminders_client.dart';
import 'clients/search_client.dart';
import 'clients/titles_client.dart';

/// NETFLY API `v1.0.0`.
///
/// Streaming platform API (viewer + staff).
class NetflyApi {
  NetflyApi(Dio dio, {String? baseUrl}) : _dio = dio, _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;

  static String get version => '1.0.0';

  ApiClient? _api;
  ConfigClient? _config;
  AuthClient? _auth;
  BillingClient? _billing;
  BrowseClient? _browse;
  CatalogClient? _catalog;
  ContinueWatchingClient? _continueWatching;
  GenresClient? _genres;
  LegalClient? _legal;
  MyListClient? _myList;
  NotificationsClient? _notifications;
  PlaybackClient? _playback;
  ProfilesClient? _profiles;
  PublicClient? _public;
  RatingsClient? _ratings;
  RemindersClient? _reminders;
  SearchClient? _search;
  TitlesClient? _titles;

  ApiClient get api => _api ??= ApiClient(_dio, baseUrl: _baseUrl);

  ConfigClient get config => _config ??= ConfigClient(_dio, baseUrl: _baseUrl);

  AuthClient get auth => _auth ??= AuthClient(_dio, baseUrl: _baseUrl);

  BillingClient get billing => _billing ??= BillingClient(_dio, baseUrl: _baseUrl);

  BrowseClient get browse => _browse ??= BrowseClient(_dio, baseUrl: _baseUrl);

  CatalogClient get catalog => _catalog ??= CatalogClient(_dio, baseUrl: _baseUrl);

  ContinueWatchingClient get continueWatching => _continueWatching ??= ContinueWatchingClient(_dio, baseUrl: _baseUrl);

  GenresClient get genres => _genres ??= GenresClient(_dio, baseUrl: _baseUrl);

  LegalClient get legal => _legal ??= LegalClient(_dio, baseUrl: _baseUrl);

  MyListClient get myList => _myList ??= MyListClient(_dio, baseUrl: _baseUrl);

  NotificationsClient get notifications => _notifications ??= NotificationsClient(_dio, baseUrl: _baseUrl);

  PlaybackClient get playback => _playback ??= PlaybackClient(_dio, baseUrl: _baseUrl);

  ProfilesClient get profiles => _profiles ??= ProfilesClient(_dio, baseUrl: _baseUrl);

  PublicClient get public => _public ??= PublicClient(_dio, baseUrl: _baseUrl);

  RatingsClient get ratings => _ratings ??= RatingsClient(_dio, baseUrl: _baseUrl);

  RemindersClient get reminders => _reminders ??= RemindersClient(_dio, baseUrl: _baseUrl);

  SearchClient get search => _search ??= SearchClient(_dio, baseUrl: _baseUrl);

  TitlesClient get titles => _titles ??= TitlesClient(_dio, baseUrl: _baseUrl);
}
