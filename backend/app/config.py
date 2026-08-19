import os

from sqlalchemy.engine import make_url


def _routing_threshold():
    """Validated at import, not at the first attempt: an out-of-range value
    would otherwise surface as a 500 from a database check constraint, on a
    student trying to start a test."""
    value = float(os.environ.get("ROUTING_THRESHOLD", 0.6))
    if not 0 <= value <= 1:
        raise RuntimeError(
            f"ROUTING_THRESHOLD must be between 0 and 1, got {value}"
        )
    return value


def _normalize_db_url(url):
    """Supabase hands out `postgres://` URLs; SQLAlchemy 2.x requires
    the `postgresql://` scheme."""
    if url and url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _describe_db_url(url):
    """A safe description of a bad DATABASE_URL: its shape, never its contents.

    This exists because the failure it serves is otherwise undiagnosable. A
    malformed value surfaces from deep inside SQLAlchemy as "Could not parse
    SQLAlchemy URL from given URL string" - no variable name, no hint at what
    is wrong with it - and the value itself must not be printed, because it
    carries the database password and deploy logs are not a secret store.

    So: lengths and yes/no facts only. Enough to tell a pasted-in quote from a
    trailing newline from an unresolved `${{Service.VAR}}` reference, and not
    one character of the credential.
    """
    notes = []
    scheme, separator, _ = url.partition("://")
    if separator:
        notes.append("scheme %r" % scheme)
    else:
        notes.append("no scheme separator")
    if url != url.strip():
        notes.append("has leading or trailing whitespace")
    if any(ord(character) in (10, 13) for character in url):
        notes.append("contains a line break")
    if len(url) >= 2 and url[0] == url[-1] and url[0] in (chr(34), chr(39)):
        notes.append("is wrapped in quotes")
    if "${{" in url:
        notes.append("contains an unresolved ${{...}} reference")
    return "%d characters, %s" % (len(url), ", ".join(notes))


def _require_db_url(url):
    """Fails with something actionable rather than an opaque parse error."""
    try:
        make_url(url)
    except Exception as error:
        raise RuntimeError(
            f"DATABASE_URL is not a usable SQLAlchemy URL "
            f"({_describe_db_url(url)}): {error}"
        ) from error
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = None

    # Access tokens are short-lived because they cannot be revoked; refresh
    # tokens are long-lived but individually revocable (see RefreshToken).
    ACCESS_TOKEN_TTL_MINUTES = int(os.environ.get("ACCESS_TOKEN_TTL_MINUTES", 15))
    REFRESH_TOKEN_TTL_DAYS = int(os.environ.get("REFRESH_TOKEN_TTL_DAYS", 30))

    # Share of module 1 answered correctly at or above which a student is
    # routed to the harder module 2. Snapshotted onto each attempt at start,
    # so changing this never rewrites a test already under way.
    ROUTING_THRESHOLD = _routing_threshold()

    # Which raw-to-scaled conversion table new attempts are scored against.
    # See app/data/scoring/ and CLAUDE.md section 7 - these are approximate.
    SCALE_TABLE_ID = os.environ.get("SCALE_TABLE_ID", "edunexus-approx-v1")

    # Exact origins allowed to call this API from a browser. Comma-separated
    # in the environment. Native clients ignore CORS entirely.
    CORS_ORIGINS = tuple(
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "").split(",")
        if origin.strip()
    )

    RATE_LIMIT_ENABLED = True
    AUTH_RATE_LIMIT_ATTEMPTS = int(os.environ.get("AUTH_RATE_LIMIT_ATTEMPTS", 10))
    AUTH_RATE_LIMIT_WINDOW_SECONDS = int(
        os.environ.get("AUTH_RATE_LIMIT_WINDOW_SECONDS", 300)
    )


class DevelopmentConfig(Config):
    DEBUG = True

    def __init__(self):
        # Vite's dev server, so the SPA works locally with no configuration.
        self.CORS_ORIGINS = Config.CORS_ORIGINS or (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        )
        # Local dev works without Supabase credentials; set DATABASE_URL to
        # point at the real Postgres instance.
        self.SQLALCHEMY_DATABASE_URI = _normalize_db_url(
            os.environ.get("DATABASE_URL")
        ) or "sqlite:///edunexus_dev.db"


class TestingConfig(Config):
    TESTING = True
    CORS_ORIGINS = ("http://localhost:5173",)
    # Off by default so unrelated tests aren't throttled; the rate-limit
    # tests re-enable it explicitly.
    RATE_LIMIT_ENABLED = False

    def __init__(self):
        self.SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


class ProductionConfig(Config):
    def __init__(self):
        # Fail fast and loudly rather than silently booting with no database
        # or a default secret key.
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL must be set in production")
        if not os.environ.get("SECRET_KEY"):
            raise RuntimeError("SECRET_KEY must be set in production")

        self.SECRET_KEY = os.environ["SECRET_KEY"]
        self.SQLALCHEMY_DATABASE_URI = _require_db_url(
            _normalize_db_url(database_url)
        )
        self.CORS_ORIGINS = Config.CORS_ORIGINS
        # Supabase's pooler drops idle connections; recycle before it does.
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(env_name=None):
    """Returns a config *instance* — the subclasses compute settings in
    __init__, which Flask's from_object only picks up on an instance."""
    env_name = env_name or os.environ.get("FLASK_ENV", "development")
    return config_by_name.get(env_name, DevelopmentConfig)()
