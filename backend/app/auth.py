import time
from collections import defaultdict, deque
from functools import wraps

from flask import current_app, g, jsonify, request

from app.services.auth_service import AuthError, get_user_from_access_token


def _bearer_token():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def require_auth(view):
    """Requires a valid access token. Sets `g.current_user`."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        token = _bearer_token()
        if token is None:
            return jsonify({"error": "authorization required"}), 401
        try:
            g.current_user = get_user_from_access_token(token)
        except AuthError as exc:
            return jsonify({"error": str(exc)}), 401
        return view(*args, **kwargs)

    return wrapper


def require_admin(view):
    """Requires a valid access token belonging to an admin."""

    @wraps(view)
    @require_auth
    def wrapper(*args, **kwargs):
        if not g.current_user.is_admin:
            return jsonify({"error": "administrator access required"}), 403
        return view(*args, **kwargs)

    return wrapper


# --- Rate limiting -----------------------------------------------------
#
# In-process and therefore per-gunicorn-worker: with N workers the effective
# limit is N x the configured value. That is good enough to blunt credential
# stuffing, but it is not a strict global limit and it resets on redeploy.
# Move this to Redis when the app runs more than a couple of workers
# (CLAUDE.md lists Redis as a later addition).
_ATTEMPTS = defaultdict(deque)


def _client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit(max_attempts=None, window_seconds=None):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            limit = max_attempts or current_app.config["AUTH_RATE_LIMIT_ATTEMPTS"]
            window = window_seconds or current_app.config["AUTH_RATE_LIMIT_WINDOW_SECONDS"]

            if current_app.config.get("RATE_LIMIT_ENABLED", True):
                key = f"{view.__name__}:{_client_ip()}"
                now = time.monotonic()
                attempts = _ATTEMPTS[key]

                while attempts and now - attempts[0] > window:
                    attempts.popleft()

                if len(attempts) >= limit:
                    retry_after = int(window - (now - attempts[0])) + 1
                    response = jsonify(
                        {"error": "too many attempts, try again later"}
                    )
                    response.headers["Retry-After"] = str(retry_after)
                    return response, 429

                attempts.append(now)

            return view(*args, **kwargs)

        return wrapper

    return decorator


def reset_rate_limits():
    """Test helper — the limiter is process-global state."""
    _ATTEMPTS.clear()
