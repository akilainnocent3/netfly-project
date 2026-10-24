// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// * `-1` - -1.
/// * `1` - 1.
/// * `2` - 2.
@JsonEnum()
enum ValueEnum {
  @JsonValue(-1)
  valueMinus1(-1),
  @JsonValue(1)
  value1(1),
  @JsonValue(2)
  value2(2),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ValueEnum(this.json);

  factory ValueEnum.fromJson(int json) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final int? json;
  int toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to int. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as int;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ValueEnum> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
