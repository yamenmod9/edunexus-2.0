import os


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

    RATE_LIMIT_ENABLED = True
    AUTH_RATE_LIMIT_ATTEMPTS = int(os.environ.get("AUTH_RATE_LIMIT_ATTEMPTS", 10))
    AUTH_RATE_LIMIT_WINDOW_SECONDS = int(
        os.environ.get("AUTH_RATE_LIMIT_WINDOW_SECONDS", 300)
    )


class DevelopmentConfig(Config):
    DEBUG = True

    def __init__(self):
        # Local dev works without Supabase credentials; set DATABASE_URL to
        # point at the real Postgres instance.
        self.SQLALCHEMY_DATABASE_URI = _normalize_db_url(
            os.environ.get("DATABASE_URL")
        ) or "sqlite:///edunexus_dev.db"


class TestingConfig(Config):
    TESTING = True
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
        self.SQLALCHEMY_DATABASE_URI = _normalize_db_url(database_url)
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
