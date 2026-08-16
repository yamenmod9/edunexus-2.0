from flask import Blueprint, jsonify

from app.auth import require_auth
from app.extensions import db
from app.models import (
    DIFFICULTIES,
    DOMAINS_BY_SECTION,
    QUESTION_TYPES,
    SECTION_ORDER,
    SOURCES,
    Question,
)

bp = Blueprint("taxonomy", __name__, url_prefix="/api/taxonomy")


def _label(value):
    return value.replace("_", " ").title()


@bp.get("")
@require_auth
def get_taxonomy():
    """The canonical question taxonomy, served so clients never hard-code it.

    The filter UI needs the same section/domain/difficulty vocabulary the
    server validates against. Duplicating it in the frontend means the two
    drift the first time a domain is added, and the symptom is a filter that
    silently returns nothing.

    Skills are read from the bank rather than declared, because unlike the
    other fields `skill` is free text (CLAUDE.md section 5).
    """
    skill_rows = (
        db.session.query(Question.section, Question.domain, Question.skill)
        .distinct()
        .all()
    )
    skills = {}
    for section, domain, skill in skill_rows:
        skills.setdefault(section, {}).setdefault(domain, []).append(skill)
    for by_domain in skills.values():
        for domain in by_domain:
            by_domain[domain] = sorted(set(by_domain[domain]))

    return jsonify(
        {
            "sections": [
                {
                    "value": section,
                    "label": "Reading & Writing"
                    if section == "reading_writing"
                    else _label(section),
                    "domains": [
                        {
                            "value": domain,
                            "label": _label(domain),
                            "skills": skills.get(section, {}).get(domain, []),
                        }
                        for domain in DOMAINS_BY_SECTION[section]
                    ],
                }
                for section in SECTION_ORDER
            ],
            "difficulties": [
                {"value": d, "label": _label(d)} for d in DIFFICULTIES
            ],
            "question_types": [
                {"value": t, "label": _label(t)} for t in QUESTION_TYPES
            ],
            "sources": [{"value": s, "label": _label(s)} for s in SOURCES],
        }
    )
