import 'package:flutter/material.dart';

import '../theme.dart';
import 'math_text.dart';

/// The formula sheet the digital SAT provides in every maths module.
///
/// These are the standard geometry reference facts the exam supplies — areas,
/// volumes, the special right triangles, the circle relationships. They are
/// mathematical facts rather than exam content, which is why reproducing them
/// is fine where reproducing questions is not (CLAUDE.md section 6).
///
/// Mirrors `web/src/components/ReferenceSheet.jsx`; the two lists must stay in
/// step, or a student who practises on the phone gets a different sheet from
/// the one they get on the laptop.
const referenceGroups = <String, List<(String, String)>>{
  'Circles': [
    ('Area', r'A = \pi r^2'),
    ('Circumference', r'C = 2\pi r'),
    ('Arc length', r's = r\theta'),
    ('Radians in a circle', r'2\pi'),
    ('Degrees in a circle', '360'),
  ],
  'Triangles': [
    ('Area', r'A = \tfrac{1}{2}bh'),
    ('Pythagorean theorem', r'a^2 + b^2 = c^2'),
    ('Special right triangle', r'30^\circ\!-\!60^\circ\!-\!90^\circ:\ x,\ x\sqrt{3},\ 2x'),
    ('Special right triangle', r'45^\circ\!-\!45^\circ\!-\!90^\circ:\ s,\ s,\ s\sqrt{2}'),
    ('Sum of interior angles', r'180^\circ'),
  ],
  'Rectangles and boxes': [
    ('Area of a rectangle', r'A = \ell w'),
    ('Volume of a box', r'V = \ell w h'),
  ],
  'Solids': [
    ('Cylinder', r'V = \pi r^2 h'),
    ('Sphere', r'V = \tfrac{4}{3}\pi r^3'),
    ('Cone', r'V = \tfrac{1}{3}\pi r^2 h'),
    ('Pyramid', r'V = \tfrac{1}{3}\ell w h'),
  ],
};

class ReferenceSheet extends StatelessWidget {
  const ReferenceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        for (final entry in referenceGroups.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 14, bottom: 6),
            child: Text(
              entry.key.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.1,
                color: c.inkFaint,
              ),
            ),
          ),
          for (final (label, formula) in entry.value)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 150,
                    child: Text(
                      label,
                      style: TextStyle(fontSize: 12.5, color: c.inkSoft),
                    ),
                  ),
                  Expanded(child: MathText('\$$formula\$')),
                ],
              ),
            ),
        ],
      ],
    );
  }
}
