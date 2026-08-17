from app.routes.analytics import bp as analytics_bp
from app.routes.attempts import bp as attempts_bp
from app.routes.auth import bp as auth_bp
from app.routes.forms import bp as forms_bp
from app.routes.health import bp as health_bp
from app.routes.questions import bp as questions_bp
from app.routes.taxonomy import bp as taxonomy_bp


def register_routes(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(questions_bp)
    app.register_blueprint(taxonomy_bp)
    app.register_blueprint(forms_bp)
    app.register_blueprint(attempts_bp)
    app.register_blueprint(analytics_bp)
