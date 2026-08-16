"""Form assembly: turn the tagged question bank into a playable test form.

A form needs six modules - module 1 plus both module 2 variants, for each of
the two sections. Module 1 is mixed difficulty; the module 2 variants skew
easy or hard. Every module of a section draws from one pool that is drained as
it goes, which is what keeps the three modules disjoint so a student never
sees the same question twice in one test.
"""

import random

from app.extensions import db
from app.models import (
    DOMAINS_BY_SECTION,
    MODULE_1_VARIANT,
    MODULE_2_VARIANTS,
    SECTION_ORDER,
    FormQuestion,
    Module,
    Question,
    TestForm,
)

# Real Digital SAT shape: R&W 27 questions / 32 min per module, Math 22 / 35.
DEFAULT_BLUEPRINT = {
    "reading_writing": {"questions_per_module": 27, "time_limit_seconds": 32 * 60},
    "math": {"questions_per_module": 22, "time_limit_seconds": 35 * 60},
}

# Difficulty mix per module slot. Module 1 spans the range so it can
# discriminate; the module 2 variants concentrate it.
DIFFICULTY_MIX = {
    MODULE_1_VARIANT: {"easy": 0.30, "medium": 0.40, "hard": 0.30},
    "easy": {"easy": 0.50, "medium": 0.35, "hard": 0.15},
    "hard": {"easy": 0.15, "medium": 0.35, "hard": 0.50},
}

MODULE_SLOTS = [(1, MODULE_1_VARIANT)] + [(2, v) for v in MODULE_2_VARIANTS]


class FormAssemblyError(Exception):
    """Raised when the bank cannot satisfy the blueprint. Carries a per-section
    shortfall breakdown so the fix is obvious: author more questions for the
    named section."""

    def __init__(self, message, shortfalls=None):
        super().__init__(message)
        self.shortfalls = shortfalls or []


def _target_counts(total, mix):
    """Split total across difficulties by mix, giving the remainder to the
    largest shares so the counts always sum back to total."""
    counts = {d: int(total * share) for d, share in mix.items()}
    remainder = total - sum(counts.values())
    for difficulty in sorted(mix, key=lambda d: -mix[d]):
        if remainder <= 0:
            break
        counts[difficulty] += 1
        remainder -= 1
    return counts


def _interleave_domains(questions, rng):
    """Spread domains through the module rather than delivering four algebra
    questions in a row: group by domain, shuffle within each, deal round-robin.
    """
    by_domain = {}
    for question in questions:
        by_domain.setdefault(question.domain, []).append(question)
    for pool in by_domain.values():
        rng.shuffle(pool)

    ordered = []
    domains = sorted(by_domain, key=lambda d: -len(by_domain[d]))
    while any(by_domain[d] for d in domains):
        for domain in domains:
            if by_domain[domain]:
                ordered.append(by_domain[domain].pop())
    return ordered


def _pick(pool_by_difficulty, wanted, rng):
    """Take the wanted count of each difficulty, falling back to whatever else
    is in stock when the bank is thin. Returns (picked, substituted_count)."""
    picked = []
    for difficulty, count in wanted.items():
        available = pool_by_difficulty.get(difficulty, [])
        for _ in range(min(count, len(available))):
            picked.append(available.pop())

    substituted = 0
    shortfall = sum(wanted.values()) - len(picked)
    if shortfall > 0:
        # Difficulty targets are a preference; module length is a hard
        # requirement, so borrow from whatever difficulty still has stock.
        leftovers = [q for pool in pool_by_difficulty.values() for q in pool]
        rng.shuffle(leftovers)
        borrowed = leftovers[:shortfall]
        for question in borrowed:
            pool_by_difficulty[question.difficulty].remove(question)
        picked.extend(borrowed)
        substituted = len(borrowed)

    return picked, substituted


def assemble_form(name, description=None, blueprint=None, seed=None, activate=True):
    """Builds and commits a complete form. Either every module is filled or
    nothing is written - a half-built form would route students into an empty
    module 2."""
    blueprint = blueprint or DEFAULT_BLUEPRINT
    rng = random.Random(seed)

    if db.session.query(TestForm).filter_by(name=name).first():
        raise FormAssemblyError("a form named {!r} already exists".format(name))

    shortfalls = []
    for section in SECTION_ORDER:
        spec = blueprint.get(section)
        if not spec:
            raise FormAssemblyError("blueprint is missing section {!r}".format(section))
        needed = spec["questions_per_module"] * len(MODULE_SLOTS)
        available = (
            db.session.query(Question)
            .filter(Question.section == section)
            .filter(Question.domain.in_(DOMAINS_BY_SECTION[section]))
            .count()
        )
        if available < needed:
            shortfalls.append(
                {
                    "section": section,
                    "needed": needed,
                    "available": available,
                    "short_by": needed - available,
                }
            )

    if shortfalls:
        detail = "; ".join(
            "{}: need {}, have {}".format(s["section"], s["needed"], s["available"])
            for s in shortfalls
        )
        raise FormAssemblyError(
            "question bank cannot fill this blueprint ({})".format(detail), shortfalls
        )

    form = TestForm(name=name, description=description, is_active=activate)
    db.session.add(form)

    substitutions = []
    for section in SECTION_ORDER:
        spec = blueprint[section]
        per_module = spec["questions_per_module"]

        pool = {"easy": [], "medium": [], "hard": []}
        questions = (
            db.session.query(Question)
            .filter(Question.section == section)
            .filter(Question.domain.in_(DOMAINS_BY_SECTION[section]))
            .all()
        )
        for question in questions:
            pool[question.difficulty].append(question)
        for bucket in pool.values():
            rng.shuffle(bucket)

        for sequence, variant in MODULE_SLOTS:
            module = Module(
                form=form,
                section=section,
                sequence=sequence,
                variant=variant,
                time_limit_seconds=spec["time_limit_seconds"],
            )
            db.session.add(module)

            picked, substituted = _pick(
                pool, _target_counts(per_module, DIFFICULTY_MIX[variant]), rng
            )
            if substituted:
                substitutions.append(
                    {
                        "section": section,
                        "sequence": sequence,
                        "variant": variant,
                        "substituted": substituted,
                    }
                )

            for position, question in enumerate(
                _interleave_domains(picked, rng), start=1
            ):
                db.session.add(
                    FormQuestion(module=module, question_id=question.id, position=position)
                )

    db.session.commit()
    return form, {"substitutions": substitutions}


def get_form(form_id):
    return db.session.get(TestForm, form_id)


def list_forms(active_only=True):
    query = db.session.query(TestForm)
    if active_only:
        query = query.filter(TestForm.is_active.is_(True))
    return query.order_by(TestForm.created_at.desc()).all()
