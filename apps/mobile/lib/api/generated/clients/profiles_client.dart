// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/patched_profile_request.dart';
import '../models/profile.dart';
import '../models/profile_list.dart';
import '../models/profile_request.dart';

part 'profiles_client.g.dart';

@RestApi()
abstract class ProfilesClient {
  factory ProfilesClient(Dio dio, {String? baseUrl}) = _ProfilesClient;

  @GET('/api/v1/profiles')
  Future<ProfileList> profilesList();

  @POST('/api/v1/profiles')
  Future<Profile> profilesCreate({@Body() required ProfileRequest body});

  @PATCH('/api/v1/profiles/{id}')
  Future<Profile> profilesUpdate({@Path('id') required int id, @Body() PatchedProfileRequest? body});

  @DELETE('/api/v1/profiles/{id}')
  Future<void> profilesDelete({@Path('id') required int id});
}
