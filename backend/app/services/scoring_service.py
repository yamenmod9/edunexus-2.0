"""Raw scores, scaled scores, and the score report.

APPROXIMATION WARNING (CLAUDE.md section 7). The scaled scores this produces
are not equated. Real SAT scaling is IRT-based and needs College Board's
per-item calibration data, which we do not have and cannot derive. The
conversion tables under app/data/scoring/ are a plausible curve with correct
endpoints and shape, nothing more. Every payload leaving this module carries
`approximation: true` and a note saying so, because a number between 200 and
800 looks authoritative whether or not it has earned the right to.

Scoring is read-only: it derives everything from the responses already stored
by the attempt engine, so a report can be regenerated at any time and no score
is ever written to a row that could drift out of sync with the answers.
"""

import json
import os
from functools import lru_cache

from app.models import DOMAINS_BY_SECTION, SECTION_ORDER

DEFAULT_SCALE_TABLE_ID = "edunexus-approx-v1"

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "scoring")


class ScoringError(Exception):
    """Raised when a report cannot be produced at all - a missing table, not
    an incomplete attempt (which is reported, not raised)."""


@lru_cache(maxsize=8)
def load_scale_table(table_id=DEFAULT_SCALE_TABLE_ID):
    path = os.path.join(_DATA_DIR, table_id.replace("-", "_") + ".json")
    if not os.path.exists(path):
        raise ScoringError(f"unknown scale table {table_id!r}")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def available_scale_tables():
    if not os.path.isdir(_DATA_DIR):
        return []
    return sorted(
        name[: -len(".json")].replace("_", "-")
        for name in os.listdir(_DATA_DIR)
        if name.endswith(".json")
    )


# --- raw scores --------------------------------------------------------


def _section_module_attempts(attempt, section):
    return [m for m in attempt.module_attempts if m.module.section == section]


def raw_score_for_section(attempt, section):
    """Correct answers and questions delivered, across every module of the
    section the student actually reached."""
    modules = _section_module_attempts(attempt, section)
    correct = sum(m.raw_correct or 0 for m in modules)
    delivered = sum(len(m.responses) for m in modules)
    return correct, delivered


def module_2_variant_for(attempt, section):
    """Which module 2 the student was routed to, or None if they never got
    there. This is what selects the conversion curve."""
    for module_attempt in _section_module_attempts(attempt, section):
        if module_attempt.module.sequence == 2:
            return module_attempt.module.variant
    return None


# --- scaled scores -----------------------------------------------------


def _lookup(curve, raw):
    # The curve is dense (one entry per raw score) and index-aligned, but do
    # not trust that: a hand-edited table could be sparse or unordered.
    if raw < curve[0]["raw"]:
        return curve[0]["scaled"]
    for entry in curve:
        if entry["raw"] == raw:
            return entry["scaled"]
    return curve[-1]["scaled"]


def scale_raw_score(table, section, variant, raw_correct, raw_possible):
    """Converts a raw count to a section score.

    Forms do not have to be full length - a practice form may run 8 questions
    a module instead of 27 - so a raw score is first projected onto the
    table's canonical length. That projection is itself an approximation: 6/8
    is treated as equivalent to 40/54, which real equating would not accept.
    """
    section_spec = table["sections"].get(section)
    if section_spec is None:
        raise ScoringError(f"scale table has no section {section!r}")
    curve = section_spec["variants"].get(variant)
    if curve is None:
        raise ScoringError(f"scale table has no {variant!r} curve for {section!r}")

    max_raw = section_spec["max_raw"]
    if raw_possible <= 0:
        projected = 0
    elif raw_possible == max_raw:
        projected = raw_correct
    else:
        projected = int(round(raw_correct * max_raw / raw_possible))
    projected = max(0, min(projected, max_raw))

    return _lookup(curve, projected), projected


# --- breakdowns --------------------------------------------------------


def _accuracy(correct, answered):
    return round(correct / answered, 4) if answered else None


def domain_breakdown(attempt):
    """Accuracy per domain. `answered` excludes questions left blank, so a
    student who ran out of time is not shown as inaccurate on questions they
    never saw; `delivered` keeps the omissions visible."""
    buckets = {}
    for module_attempt in attempt.module_attempts:
        for response in module_attempt.responses:
            question = response.question
            key = (question.section, question.domain)
            bucket = buckets.setdefault(
                key, {"delivered": 0, "answered": 0, "correct": 0}
            )
            bucket["delivered"] += 1
            if response.answer is not None:
                bucket["answered"] += 1
            if response.is_correct:
                bucket["correct"] += 1

    rows = []
    for section in SECTION_ORDER:
        for domain in DOMAINS_BY_SECTION[section]:
            bucket = buckets.get((section, domain))
            if bucket is None:
                continue
            rows.append(
                {
                    "section": section,
                    "domain": domain,
                    "delivered": bucket["delivered"],
                    "answered": bucket["answered"],
                    "correct": bucket["correct"],
                    "accuracy": _accuracy(bucket["correct"], bucket["answered"]),
                }
            )
    return rows


def difficulty_breakdown(attempt):
    buckets = {}
    for module_attempt in attempt.module_attempts:
        for response in module_attempt.responses:
            bucket = buckets.setdefault(
                response.question.difficulty,
                {"delivered": 0, "answered": 0, "correct": 0},
            )
            bucket["delivered"] += 1
            if response.answer is not None:
                bucket["answered"] += 1
            if response.is_correct:
                bucket["correct"] += 1

    return [
        {
            "difficulty": difficulty,
            "delivered": buckets[difficulty]["delivered"],
            "answered": buckets[difficulty]["answered"],
            "correct": buckets[difficulty]["correct"],
            "accuracy": _accuracy(
                buckets[difficulty]["correct"], buckets[difficulty]["answered"]
            ),
        }
        for difficulty in ("easy", "medium", "hard")
        if difficulty in buckets
    ]


# --- the report --------------------------------------------------------


def score_attempt(attempt):
    """Builds the full score report. Safe to call on any finished attempt,
    including one abandoned partway: sections the student never completed are
    reported as incomplete with a null scaled score rather than being given an
    invented number."""
    table = load_scale_table(attempt.scale_table_id or DEFAULT_SCALE_TABLE_ID)

    sections = []
    for section in SECTION_ORDER:
        raw_correct, raw_possible = raw_score_for_section(attempt, section)
        variant = module_2_variant_for(attempt, section)

        scaled = None
        projected = None
        incomplete_reason = None

        if variant is None:
            incomplete_reason = (
                "the student did not reach module 2 of this section, so there "
                "is no routed path to scale against"
            )
        elif raw_possible <= 0:
            incomplete_reason = "no questions were delivered in this section"
        else:
            scaled, projected = scale_raw_score(
                table, section, variant, raw_correct, raw_possible
            )

        sections.append(
            {
                "section": section,
                "raw_correct": raw_correct,
                "raw_possible": raw_possible,
                "module_2_variant": variant,
                "scaled_score": scaled,
                "projected_raw": projected,
                "complete": scaled is not None,
                "incomplete_reason": incomplete_reason,
                "modules": [
                    {
                        "order_index": m.order_index,
                        "sequence": m.module.sequence,
                        "variant": m.module.variant,
                        "status": m.status,
                        "raw_correct": m.raw_correct,
                        "question_count": len(m.responses),
                    }
                    for m in _section_module_attempts(attempt, section)
                ],
            }
        )

    complete = all(s["complete"] for s in sections)
    total = sum(s["scaled_score"] for s in sections) if complete else None

    return {
        "attempt_id": attempt.id,
        "status": attempt.status,
        "submitted_at": attempt.submitted_at.isoformat()
        if attempt.submitted_at
        else None,
        "total": {
            "scaled_score": total,
            "min": table["scale_min"] * len(SECTION_ORDER),
            "max": table["scale_max"] * len(SECTION_ORDER),
            "complete": complete,
        },
        "sections": sections,
        "domains": domain_breakdown(attempt),
        "difficulty": difficulty_breakdown(attempt),
        "scale_table": {
            "id": table["id"],
            "approximation": table["approximation"],
            "description": table["description"],
        },
        # Repeated at the top level so a client cannot render a score without
        # having been handed the caveat alongside it.
        "approximation": True,
        "approximation_note": (
            "Scaled scores are an approximation, not official SAT equating. "
            "They are calculated from a fixed conversion curve rather than "
            "from item calibration data, and should be read as practice "
            "feedback rather than a predicted official score."
        ),
    }
