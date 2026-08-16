from flask import Blueprint, g, jsonify, request
from marshmallow import ValidationError

from app.auth import require_admin, require_auth
from app.extensions import db
from app.models import TestAttempt
from app.schemas import create_form_schema
from app.services.form_service import (
    FormAssemblyError,
    assemble_form,
    get_form,
    list_forms,
)

bp = Blueprint("forms", __name__, url_prefix="/api/forms")


@bp.get("")
@require_auth
def list_forms_route():
    admin = g.current_user.is_admin
    forms = list_forms(active_only=not admin)
    return jsonify(
        {"items": [form.to_dict(include_variants=admin) for form in forms]}
    )


@bp.get("/<form_id>")
@require_auth
def get_form_route(form_id):
    form = get_form(form_id)
    admin = g.current_user.is_admin
    if form is None or (not admin and not form.is_active):
        return jsonify({"error": "form not found"}), 404
    return jsonify(form.to_dict(include_variants=admin))


@bp.post("")
@require_admin
def create_form_route():
    try:
        data = create_form_schema.load(request.get_json(force=True, silent=True) or {})
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        form, report = assemble_form(**data)
    except FormAssemblyError as exc:
        return jsonify({"error": str(exc), "shortfalls": exc.shortfalls}), 422

    payload = form.to_dict(include_variants=True)
    payload["assembly"] = report
    return jsonify(payload), 201


@bp.delete("/<form_id>")
@require_admin
def delete_form_route(form_id):
    form = get_form(form_id)
    if form is None:
        return jsonify({"error": "form not found"}), 404

    # Attempts reference the form's modules; deleting it would orphan a
    # student's history. Deactivate instead of forcing the issue.
    attempts = db.session.query(TestAttempt).filter_by(form_id=form.id).count()
    if attempts:
        return (
            jsonify(
                {
                    "error": "form has attempts and cannot be deleted; "
                    "deactivate it instead",
                    "attempts": attempts,
                }
            ),
            409,
        )

    db.session.delete(form)
    db.session.commit()
    return "", 204
