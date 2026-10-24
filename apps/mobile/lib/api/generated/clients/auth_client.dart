// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/app_request.dart';
import '../models/change_password_request.dart';
import '../models/code_sent.dart';
import '../models/confirm_request.dart';
import '../models/login_request.dart';
import '../models/mobile_login_request.dart';
import '../models/mobile_refresh_request.dart';
import '../models/mobile_session.dart';
import '../models/mobile_signup_request.dart';
import '../models/patched_user_request.dart';
import '../models/reset_confirm_request.dart';
import '../models/reset_start_request.dart';
import '../models/reset_start_result.dart';
import '../models/session.dart';
import '../models/signup_request.dart';
import '../models/start_request.dart';
import '../models/user.dart';
import '../models/username_availability.dart';
import '../models/verified.dart';
import '../models/verify_status.dart';

part 'auth_client.g.dart';

@RestApi()
abstract class AuthClient {
  factory AuthClient(Dio dio, {String? baseUrl}) = _AuthClient;

  @POST('/api/v1/auth/login')
  Future<Session> authLogin({@Body() required LoginRequest body});

  @POST('/api/v1/auth/logout')
  Future<void> authLogout({@Body() AppRequest? body});

  @GET('/api/v1/auth/me')
  Future<User> authMe();

  @PATCH('/api/v1/auth/me')
  Future<User> authMeUpdate({@Body() PatchedUserRequest? body});

  @POST('/api/v1/auth/me/password')
  Future<Session> authChangePassword({@Body() required ChangePasswordRequest body});

  @POST('/api/v1/auth/mobile/login')
  Future<MobileSession> authMobileLogin({@Body() required MobileLoginRequest body});

  @POST('/api/v1/auth/mobile/logout')
  Future<void> authMobileLogout({@Body() required MobileRefreshRequest body});

  @POST('/api/v1/auth/mobile/refresh')
  Future<MobileSession> authMobileRefresh({@Body() required MobileRefreshRequest body});

  @POST('/api/v1/auth/mobile/signup')
  Future<MobileSession> authMobileSignup({@Body() required MobileSignupRequest body});

  /// A correct code sets the new password, signs out every device and signs this one in.
  @POST('/api/v1/auth/password-reset/confirm')
  Future<Session> authPasswordResetConfirm({@Body() required ResetConfirmRequest body});

  /// Same answer whether or not the account exists (no account enumeration).
  @POST('/api/v1/auth/password-reset/start')
  Future<ResetStartResult> authPasswordResetStart({@Body() required ResetStartRequest body});

  @POST('/api/v1/auth/refresh')
  Future<Session> authRefresh({@Body() AppRequest? body});

  @POST('/api/v1/auth/signup')
  Future<Session> authSignup({@Body() required SignupRequest body});

  @GET('/api/v1/auth/username-available')
  Future<UsernameAvailability> authUsernameAvailable({@Query('username') required String username});

  @GET('/api/v1/auth/verify')
  Future<VerifyStatus> verifyStatus();

  @POST('/api/v1/auth/verify/{channel}/confirm')
  Future<Verified> verifyConfirm({@Path('channel') required String channel, @Body() required ConfirmRequest body});

  @POST('/api/v1/auth/verify/{channel}/start')
  Future<CodeSent> verifyStart({@Path('channel') required String channel, @Body() required StartRequest body});
}
