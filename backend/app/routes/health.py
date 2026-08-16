from flask import Blueprint, jsonify
from sqlalchemy import text

from app.extensions import db

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    """Liveness probe. Deliberately does not touch the database — Railway uses
    this for deploy health checks, and a transient DB blip shouldn't fail a
    deploy of an otherwise-healthy process."""
    return jsonify({"status": "ok"})


@bp.get("/health/db")
def health_db():
    """Readiness probe: confirms the app can actually reach Postgres."""
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ok", "database": "connected"})
    except Exception as exc:  # noqa: BLE001 - report any connectivity failure
        return (
            jsonify(
                {
                    "status": "error",
                    "database": "unreachable",
                    "detail": type(exc).__name__,
                }
            ),
            503,
        )
