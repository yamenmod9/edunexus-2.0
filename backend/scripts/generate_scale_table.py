"""Regenerate a raw-to-scaled conversion table.

The table this writes is an APPROXIMATION and is not psychometrically valid.
Real SAT equating is IRT-based and needs College Board's per-item calibration
data, which we do not have (CLAUDE.md section 7). What we produce instead is a
smooth, monotone, defensible curve with the right shape and the right
endpoints, stored as data so it can be replaced wholesale — by better
estimates, or by real conversion charts if they ever become available —
without touching a line of scoring code.

The two curves per section encode the one structural fact that does carry
over from the real exam: routing to the easier module 2 caps the section
score. A student who never sees the harder questions cannot demonstrate the
ability the top of the scale represents.

Usage:
    python -m scripts.generate_scale_table            # rewrite the v1 table
    python -m scripts.generate_scale_table --stdout   # print, don't write
"""

import argparse
import json
import os
import sys

TABLE_ID = "edunexus-approx-v1"

SECTION_MAX_RAW = {
    # Full-length Digital SAT: two modules per section.
    "reading_writing": 54,  # 27 + 27
    "math": 44,  # 22 + 22
}

SCALE_MIN = 200
SCALE_MAX = 800
# The easier module 2 caps the section here. On the real exam the lower path
# tops out somewhere in the low 600s; this is the same idea, not the same
# number.
EASY_PATH_CAP = 600

# Anchor points as (proportion of raw available, scaled score). Linearly
# interpolated between anchors, which gives the characteristic SAT shape:
# steep at the bottom, flatter through the middle, steep again at the top.
ANCHORS = {
    "hard": [(0.0, 200), (0.10, 330), (0.25, 450), (0.50, 570), (0.75, 680), (0.90, 750), (1.0, 800)],
    "easy": [(0.0, 200), (0.10, 260), (0.25, 330), (0.50, 430), (0.75, 520), (0.90, 570), (1.0, 600)],
}


def interpolate(proportion, anchors):
    for i in range(len(anchors) - 1):
        x0, y0 = anchors[i]
        x1, y1 = anchors[i + 1]
        if x0 <= proportion <= x1:
            if x1 == x0:
                return y1
            weight = (proportion - x0) / (x1 - x0)
            return y0 + weight * (y1 - y0)
    return anchors[-1][1]


def build_curve(max_raw, anchors):
    """One entry per attainable raw score. Scores are rounded to the nearest
    10, as SAT section scores are always multiples of 10, then forced
    non-decreasing so rounding can never make an extra correct answer lower
    the score."""
    curve = []
    previous = SCALE_MIN
    for raw in range(max_raw + 1):
        proportion = raw / max_raw if max_raw else 0.0
        scaled = int(round(interpolate(proportion, anchors) / 10.0)) * 10
        scaled = max(scaled, previous)
        curve.append({"raw": raw, "scaled": scaled})
        previous = scaled
    return curve


def build_table():
    sections = {}
    for section, max_raw in SECTION_MAX_RAW.items():
        sections[section] = {
            "max_raw": max_raw,
            "variants": {
                variant: build_curve(max_raw, anchors)
                for variant, anchors in ANCHORS.items()
            },
        }

    return {
        "id": TABLE_ID,
        "scale_min": SCALE_MIN,
        "scale_max": SCALE_MAX,
        "easy_path_cap": EASY_PATH_CAP,
        "approximation": True,
        "description": (
            "Approximate raw-to-scaled conversion for EduNexus practice tests. "
            "NOT psychometrically equated. Real SAT scaling is IRT-based and "
            "requires College Board item calibration data. Treat these scores "
            "as a practice indicator of the right rough magnitude, not as a "
            "predicted official score."
        ),
        "generated_by": "scripts/generate_scale_table.py",
        "sections": sections,
    }


def main():
    parser = argparse.ArgumentParser(description="Regenerate the scale table.")
    parser.add_argument("--stdout", action="store_true", help="Print instead of writing.")
    args = parser.parse_args()

    table = build_table()
    payload = json.dumps(table, indent=2) + "\n"

    if args.stdout:
        print(payload)
        return 0

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "app", "data", "scoring", f"{TABLE_ID.replace('-', '_')}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(payload)

    print(f"wrote {path}")
    for section, spec in table["sections"].items():
        for variant, curve in spec["variants"].items():
            print(
                f"  {section:<16} {variant:<5} raw 0-{spec['max_raw']:<3} "
                f"-> {curve[0]['scaled']}-{curve[-1]['scaled']}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
