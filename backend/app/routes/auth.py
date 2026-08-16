from flask import Blueprint, g, jsonify, request
from marshmallow import ValidationError

from app.auth import rate_limit, require_auth
from app.schemas import (
    change_password_schema,
    login_schema,
    refresh_schema,
    register_schema,
)
from app.services.auth_service import (
    AuthError,
    authenticate,
    change_password,
    issue_token_pair,
    register_user,
    revoke_refresh_token,
)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _payload():
    return request.get_json(force=True, silent=True) or {}


@bp.post("/register")
@rate_limit()
def register():
    try:
        data = register_schema.load(_payload())
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        user = register_user(data["email"], data["password"])
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 409

    return jsonify({"user": user.to_dict(), **issue_token_pair(user)}), 201


@bp.post("/login")
@rate_limit()
def login():
    try:
        data = login_schema.load(_payload())
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        user = authenticate(data["email"], data["password"])
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401

    return jsonify({"user": user.to_dict(), **issue_token_pair(user)})


@bp.post("/refresh")
@rate_limit()
def refresh():
    try:
        data = refresh_schema.load(_payload())
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    # Imported here so the module stays readable; rotation revokes the
    # presented token and issues a brand new pair.
    from app.services.auth_service import rotate_refresh_token

    try:
        user, tokens = rotate_refresh_token(data["refresh_token"])
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401

    return jsonify({"user": user.to_dict(), **tokens})


@bp.post("/logout")
def logout():
    try:
        data = refresh_schema.load(_payload())
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        revoke_refresh_token(data["refresh_token"])
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401

    return "", 204


@bp.get("/me")
@require_auth
def me():
    return jsonify(g.current_user.to_dict())


@bp.post("/password")
@require_auth
def update_password():
    try:
        data = change_password_schema.load(_payload())
    except ValidationError as err:
        return jsonify({"errors": err.messages}), 422

    try:
        change_password(
            g.current_user, data["current_password"], data["new_password"]
        )
    except AuthError as exc:
        return jsonify({"error": str(exc)}), 401

    # Every refresh token was revoked, so the client must log in again.
    return jsonify({"status": "password updated, please log in again"})
