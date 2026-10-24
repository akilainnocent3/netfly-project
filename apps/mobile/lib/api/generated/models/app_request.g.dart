// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppRequest _$AppRequestFromJson(Map<String, dynamic> json) =>
    AppRequest(app: json['app'] == null ? AppEnum.client : AppEnum.fromJson(json['app'] as String));

Map<String, dynamic> _$AppRequestToJson(AppRequest instance) => <String, dynamic>{'app': instance.app};
