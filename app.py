"""
TWG Mobile — Flask Application Factory
"""

import os
from datetime import datetime

import msal
from flask import Flask, redirect, render_template, session, url_for
from flask_session import Session

from twg_mobile.config import Config


def create_app():
    """Create and configure the Flask application."""

    app = Flask(__name__)
    app.config.from_object(Config)

    # ---------- Server-side session ----------
    os.makedirs(app.config["SESSION_FILE_DIR"], exist_ok=True)
    Session(app)

    # ---------- MSAL confidential client ----------
    app.msal_app = msal.ConfidentialClientApplication(
        client_id=app.config["AZURE_CLIENT_ID"],
        client_credential=app.config["AZURE_CLIENT_SECRET"],
        authority=app.config["AZURE_AUTHORITY"],
    )

    # ---------- Template globals ----------
    @app.context_processor
    def inject_globals():
        """Make common variables available in every template."""
        return {
            "app_version": app.config["APP_VERSION"],
            "current_year": datetime.now().year,
        }

    # ---------- Error handlers ----------
    @app.errorhandler(403)
    def forbidden(e):
        return render_template("errors/403.html"), 403

    @app.errorhandler(404)
    def not_found(e):
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def server_error(e):
        return render_template("errors/500.html"), 500

    # ---------- Register blueprints ----------
    from twg_mobile.auth.routes import auth_bp

    app.register_blueprint(auth_bp)

    # Future feature modules — uncomment as they are built:
    # from twg_mobile.modules.orders.routes import orders_bp
    # from twg_mobile.modules.customers.routes import customers_bp
    # from twg_mobile.modules.inventory.routes import inventory_bp
    # app.register_blueprint(orders_bp, url_prefix="/orders")
    # app.register_blueprint(customers_bp, url_prefix="/customers")
    # app.register_blueprint(inventory_bp, url_prefix="/inventory")

    # ---------- Root route ----------
    @app.route("/")
    def index():
        """Redirect to the home/dashboard page (orders for now)."""
        if "user" not in session:
            return redirect(url_for("auth.login"))
        # Once the orders module is live this will point there.
        return redirect(url_for("auth.profile"))

    # ---------- Offline fallback (served by the service worker) ----------
    @app.route("/offline")
    def offline():
        return render_template("offline.html")

    return app
