import 'package:material_ui/material_ui.dart';

const _colors = [
  Color(0xFFE50914), Color(0xFF2B6CDF), Color(0xFFF5B301), Color(0xFF1DB954), //
  Color(0xFF8E44AD), Color(0xFF00A8A8), Color(0xFFF26B1D), Color(0xFFD6336C),
  Color(0xFF5C7CFA), Color(0xFF4C9A2A), Color(0xFFB5179E), Color(0xFF6C757D),
];
const _faces = ['smile', 'grin', 'wink', 'calm'];

/// Preset avatars: simple faces on brand-safe colours (apps/client/src/components/profiles/avatar.tsx).
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({super.key, this.avatarKey, this.size = 96, this.label});

  final String? avatarKey;
  final double size;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final n = int.tryParse((avatarKey ?? '').replaceAll(RegExp(r'\D'), '')) ?? 1;
    final i = (n < 1 ? 1 : n) - 1;
    final art = ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.06),
      child: CustomPaint(
        size: Size.square(size),
        painter: _FacePainter(_colors[i % _colors.length], _faces[i % _faces.length]),
      ),
    );
    return label == null ? ExcludeSemantics(child: art) : Semantics(image: true, label: label, child: art);
  }
}

class _FacePainter extends CustomPainter {
  _FacePainter(this.color, this.face);
  final Color color;
  final String face;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 100);
    const r = Rect.fromLTWH(0, 0, 100, 100);
    canvas
      ..drawRect(r, Paint()..color = color)
      ..drawRect(
        r,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x2EFFFFFF), Color(0x2E000000)],
          ).createShader(r),
      );
    final white = Paint()..color = Colors.white;
    final stroke = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    if (face == 'wink') {
      canvas
        ..drawCircle(const Offset(34, 40), 6, white)
        ..drawLine(const Offset(60, 40), const Offset(72, 40), stroke);
    } else {
      final eye = face == 'calm' ? 4.0 : 6.0;
      canvas
        ..drawCircle(const Offset(34, 40), eye, white)
        ..drawCircle(const Offset(66, 40), eye, white);
    }
    if (face == 'grin') {
      canvas.drawPath(
        Path()
          ..moveTo(26, 60)
          ..quadraticBezierTo(50, 86, 74, 60)
          ..close(),
        white,
      );
    } else if (face == 'calm') {
      canvas.drawLine(const Offset(34, 66), const Offset(66, 66), stroke);
    } else {
      canvas.drawPath(
        Path()
          ..moveTo(28, 60)
          ..quadraticBezierTo(50, 80, 72, 60),
        stroke,
      );
    }
  }

  @override
  bool shouldRepaint(_FacePainter old) => old.color != color || old.face != face;
}
