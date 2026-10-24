// Prepares the shared OpenAPI schema for the Dart client generator (swagger_parser):
// * keeps only the viewer API (Studio's /api/v1/admin/* is never called by the app), then drops
//   schemas nothing references any more;
// * sends request bodies as JSON only (the schema also lists form encodings);
// * rewrites drf-spectacular's nullable enums (`oneOf: [Enum, NullEnum]`) to a nullable `Enum`,
//   and `oneOf: [Enum, BlankEnum]` to a plain string — the generator can't express either.
//
// dart run tool/prepare_openapi.dart  (writes build/openapi.mobile.json)
import 'dart:convert';
import 'dart:io';

const source = '../../packages/api-client/openapi.json';
const target = 'build/openapi.mobile.json';

void main() {
  final spec = jsonDecode(File(source).readAsStringSync()) as Map<String, dynamic>;
  final paths = (spec['paths'] as Map<String, dynamic>)..removeWhere((path, _) => path.startsWith('/api/v1/admin/'));
  final schemas = (spec['components'] as Map<String, dynamic>)['schemas'] as Map<String, dynamic>;

  Object? rewrite(Object? node) {
    if (node is Map<String, dynamic>) {
      final oneOf = node['oneOf'];
      if (oneOf is List && oneOf.length == 2) {
        final refs = oneOf.map((o) => o is Map ? o[r'$ref'] as String? : null).toList();
        if (refs[1] == '#/components/schemas/NullEnum') {
          return {
            'allOf': [
              {r'$ref': refs[0]},
            ],
            'nullable': true,
          };
        }
        if (refs[1] == '#/components/schemas/BlankEnum') return {'type': 'string'};
      }
      return node.map((key, value) => MapEntry(key, rewrite(value)));
    }
    if (node is List) return node.map(rewrite).toList();
    return node;
  }

  // Requests go out as JSON, like the web's: drop the form encodings drf-spectacular also lists.
  for (final item in paths.values) {
    for (final op in (item as Map<String, dynamic>).values) {
      if (op is! Map) continue;
      final body = op['requestBody'];
      if (body is! Map) continue;
      final content = body['content'];
      if (content is Map && content.containsKey('application/json')) {
        content.removeWhere((type, _) => type != 'application/json');
      }
    }
  }

  spec['paths'] = rewrite(paths);
  (spec['components'] as Map<String, dynamic>)['schemas'] = rewrite(schemas);

  // Keep only schemas reachable from the remaining paths.
  final all = (spec['components'] as Map<String, dynamic>)['schemas'] as Map<String, dynamic>;
  final keep = <String>{};
  void mark(Object? node) {
    if (node is Map) {
      final ref = node[r'$ref'];
      if (ref is String && ref.startsWith('#/components/schemas/')) {
        final name = ref.substring('#/components/schemas/'.length);
        if (keep.add(name)) mark(all[name]);
      }
      node.values.forEach(mark);
    } else if (node is List) {
      node.forEach(mark);
    }
  }

  mark(spec['paths']);
  all.removeWhere((name, _) => !keep.contains(name));

  File(target)
    ..createSync(recursive: true)
    ..writeAsStringSync(const JsonEncoder.withIndent('  ').convert(spec));
  stdout.writeln('${(spec['paths'] as Map).length} paths, ${all.length} schemas → $target');
}
