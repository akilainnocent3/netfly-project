// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// * `free` - Free.
/// * `trialing` - Trialing.
/// * `active` - Active.
/// * `past_due` - Past Due.
/// * `grace` - Grace.
/// * `canceled` - Canceled.
/// * `expired` - Expired.
@JsonEnum()
enum SubscriptionStatusEnum {
  @JsonValue('free')
  free('free'),
  @JsonValue('trialing')
  trialing('trialing'),
  @JsonValue('active')
  active('active'),
  @JsonValue('past_due')
  pastDue('past_due'),
  @JsonValue('grace')
  grace('grace'),
  @JsonValue('canceled')
  canceled('canceled'),
  @JsonValue('expired')
  expired('expired'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SubscriptionStatusEnum(this.json);

  factory SubscriptionStatusEnum.fromJson(String json) =>
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
  static List<SubscriptionStatusEnum> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
