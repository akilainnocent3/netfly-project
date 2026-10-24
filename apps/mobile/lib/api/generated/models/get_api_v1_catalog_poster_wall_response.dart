// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'get_api_v1_catalog_poster_wall_response.g.dart';

@JsonSerializable()
class GetApiV1CatalogPosterWallResponse {
  const GetApiV1CatalogPosterWallResponse({this.results});

  factory GetApiV1CatalogPosterWallResponse.fromJson(Map<String, Object?> json) =>
      _$GetApiV1CatalogPosterWallResponseFromJson(json);

  final List<dynamic>? results;

  Map<String, Object?> toJson() => _$GetApiV1CatalogPosterWallResponseToJson(this);
}
