// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// * `reminder` - reminder.
/// * `new_episodes` - new_episodes.
/// * `recently_added` - recently_added.
@JsonEnum()
enum NotificationKindEnum {
  @JsonValue('reminder')
  reminder('reminder'),
  @JsonValue('new_episodes')
  newEpisodes('new_episodes'),
  @JsonValue('recently_added')
  recentlyAdded('recently_added'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const NotificationKindEnum(this.json);

  factory NotificationKindEnum.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<NotificationKindEnum> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
