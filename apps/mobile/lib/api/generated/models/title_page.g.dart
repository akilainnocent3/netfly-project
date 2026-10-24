// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'title_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TitlePage _$TitlePageFromJson(Map<String, dynamic> json) => TitlePage(
  title: TitleDetail.fromJson(json['title'] as Map<String, dynamic>),
  viewer: json['viewer'] == null ? null : ViewerState.fromJson(json['viewer'] as Map<String, dynamic>),
  moreLikeThis: (json['more_like_this'] as List<dynamic>)
      .map((e) => TitleCard.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$TitlePageToJson(TitlePage instance) => <String, dynamic>{
  'title': instance.title,
  'viewer': ?instance.viewer,
  'more_like_this': instance.moreLikeThis,
};
