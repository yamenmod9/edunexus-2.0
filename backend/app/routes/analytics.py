from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.services import analytics_service

bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


def _positive_int(name, default):
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@bp.get("/dashboard")
@require_auth
def dashboard_route():
    min_sample = _positive_int("min_sample", analytics_service.DEFAULT_MIN_SAMPLE)
    weak_limit = _positive_int("weak_limit", analytics_service.DEFAULT_WEAK_LIMIT)
    return jsonify(analytics_service.dashboard(g.current_user, min_sample, weak_limit))
