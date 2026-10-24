// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// * `start` - Start.
/// * `play` - Play.
/// * `pause` - Pause.
/// * `seek` - Seek.
/// * `quality` - Quality.
/// * `rebuffer` - Rebuffer.
/// * `complete` - Complete.
/// * `error` - Error.
/// * `heartbeat` - Heartbeat.
@JsonEnum()
enum EventKindEnum {
  @JsonValue('start')
  start('start'),
  @JsonValue('play')
  play('play'),
  @JsonValue('pause')
  pause('pause'),
  @JsonValue('seek')
  seek('seek'),
  @JsonValue('quality')
  quality('quality'),
  @JsonValue('rebuffer')
  rebuffer('rebuffer'),
  @JsonValue('complete')
  complete('complete'),
  @JsonValue('error')
  error('error'),
  @JsonValue('heartbeat')
  heartbeat('heartbeat'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EventKindEnum(this.json);

  factory EventKindEnum.fromJson(String json) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

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
  static List<EventKindEnum> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
