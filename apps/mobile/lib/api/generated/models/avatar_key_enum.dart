// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// * `avatar-1` - avatar-1.
/// * `avatar-2` - avatar-2.
/// * `avatar-3` - avatar-3.
/// * `avatar-4` - avatar-4.
/// * `avatar-5` - avatar-5.
/// * `avatar-6` - avatar-6.
/// * `avatar-7` - avatar-7.
/// * `avatar-8` - avatar-8.
/// * `avatar-9` - avatar-9.
/// * `avatar-10` - avatar-10.
/// * `avatar-11` - avatar-11.
/// * `avatar-12` - avatar-12.
@JsonEnum()
enum AvatarKeyEnum {
  @JsonValue('avatar-1')
  avatar1('avatar-1'),
  @JsonValue('avatar-2')
  avatar2('avatar-2'),
  @JsonValue('avatar-3')
  avatar3('avatar-3'),
  @JsonValue('avatar-4')
  avatar4('avatar-4'),
  @JsonValue('avatar-5')
  avatar5('avatar-5'),
  @JsonValue('avatar-6')
  avatar6('avatar-6'),
  @JsonValue('avatar-7')
  avatar7('avatar-7'),
  @JsonValue('avatar-8')
  avatar8('avatar-8'),
  @JsonValue('avatar-9')
  avatar9('avatar-9'),
  @JsonValue('avatar-10')
  avatar10('avatar-10'),
  @JsonValue('avatar-11')
  avatar11('avatar-11'),
  @JsonValue('avatar-12')
  avatar12('avatar-12'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AvatarKeyEnum(this.json);

  factory AvatarKeyEnum.fromJson(String json) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

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
  static List<AvatarKeyEnum> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
