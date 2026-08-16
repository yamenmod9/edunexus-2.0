"""CORS for the browser clients.

Hand-rolled rather than pulling in Flask-CORS: the policy we need is a fixed
allowlist and a preflight response, and an allowlist is short enough to read
in one screen. Native clients (Flutter, Phase 6) are unaffected - CORS is a
browser mechanism and never reaches them.

The allowlist is exact-origin matching, never a wildcard and never a prefix
match. `https://edunexus.app.evil.com` starts with our domain and must not be
allowed, which is exactly the bug prefix matching introduces.

Preflights need no route of their own: Flask answers OPTIONS automatically for
every registered rule, and the after_request hook below decorates that
response like any other. A preflight for a path that does not exist should
404, which is what already happens.
"""

from flask import request

# Methods and headers the SPA actually uses. Kept explicit so adding a new one
# is a deliberate act.
ALLOWED_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
ALLOWED_HEADERS = "Authorization, Content-Type"
MAX_AGE = "86400"  # cache the preflight for a day


def _origin_allowed(origin, allowed):
    return bool(origin) and origin in allowed


def init_cors(app):
    allowed = set(app.config.get("CORS_ORIGINS") or ())

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")
        if _origin_allowed(origin, allowed):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
            response.headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
            response.headers["Access-Control-Max-Age"] = MAX_AGE
            # Responses differ by Origin, so any shared cache must key on it.
            response.headers.add("Vary", "Origin")
        return response
