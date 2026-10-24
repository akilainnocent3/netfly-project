// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/legal_page.dart';

part 'legal_client.g.dart';

@RestApi()
abstract class LegalClient {
  factory LegalClient(Dio dio, {String? baseUrl}) = _LegalClient;

  @GET('/api/v1/legal/{slug}')
  Future<LegalPage> legalPage({@Path('slug') required String slug});
}
