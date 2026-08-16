from flask import Blueprint, jsonify, request
from marshmallow import ValidationError

from app.auth import require_admin, require_auth
from app.schemas import question_schema, questions_schema, question_update_schema
from app.services.question_service import (
    create_question,
    delete_question,
    get_question,
    query_questions,
    update_question,
)

bp = Blueprint("questions", __name__, url_prefix="/api/questions")


@bp.get("")
@require_auth
def list_questions():
    filters = {
        "section": request.args.get("section"),
        "domain": request.args.get("domain"),
        "skill": request.args.get("skill"),
        "difficulty": request.args.get("difficulty"),
        "question_type": request.args.get("question_type"),
        "source": request.args.get("source"),
    }
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 200)

    pagination = query_questions(filters, page=page, per_page=per_page)
    return jsonify(
        {
            "items": questions_schema.dump(pagination.items),
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
        }
    )


@bp.get("/<question_id>")
@require_auth
def get_question_route(question_id):
    question = get_question(question_id)
    if question is None:
        return jsonify({"error": "question not found"}), 404
    return jsonify(question_schema.dump(question))


@bp.post("")
@require_admin
def create_question_route():
    try:
        data = question_schema.load(request.get_json(force=True, silent=True) or {})
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    question = create_question(data)
    return jsonify(question_schema.dump(question)), 201


@bp.patch("/<question_id>")
@require_admin
def update_question_route(question_id):
    question = get_question(question_id)
    if question is None:
        return jsonify({"error": "question not found"}), 404

    try:
        data = question_update_schema.load(request.get_json(force=True, silent=True) or {})
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    # Re-validate the merged record so a partial update can't leave the
    # question in a state that violates cross-field rules (e.g. domain no
    # longer matching section). Dump-only fields are excluded — the schema
    # rejects them on load.
    dump_only = {
        name for name, f in question_schema.fields.items() if f.dump_only
    }
    merged = {
        k: v for k, v in question_schema.dump(question).items() if k not in dump_only
    }
    merged.update(data)
    errors = question_schema.validate(merged)
    if errors:
        return jsonify({"errors": errors}), 422

    question = update_question(question, data)
    return jsonify(question_schema.dump(question))


@bp.delete("/<question_id>")
@require_admin
def delete_question_route(question_id):
    question = get_question(question_id)
    if question is None:
        return jsonify({"error": "question not found"}), 404

    delete_question(question)
    return "", 204
