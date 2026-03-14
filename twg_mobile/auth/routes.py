"""
TWG Mobile — Auth Routes
Microsoft Entra ID SSO via MSAL: login, callback, logout, profile.
"""

import uuid
from flask import (
    Blueprint,
    current_app,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
@auth_bp.route("/login")
def login():
    """Show the login page. If already authenticated, redirect to home."""
    if "user" in session:
        return redirect(url_for("index"))
    return render_template("auth/login.html")


@auth_bp.route("/login/start")
def login_start():
    """
    Begin the Entra ID authorization-code flow.
    Generates a state token, builds the auth URL, and redirects the browser
    to Microsoft's login page.
    """
    state = str(uuid.uuid4())
    session["auth_state"] = state

    scopes = current_app.config["AZURE_SCOPES"]

    auth_url = current_app.msal_app.get_authorization_request_url(
        scopes=scopes,
        state=state,
        redirect_uri=current_app.config["AZURE_REDIRECT_URI"],
    )
    return redirect(auth_url)


# ---------------------------------------------------------------------------
# Callback — Entra ID redirects here after the user authenticates
# ---------------------------------------------------------------------------
@auth_bp.route("/callback")
def callback():
    """
    Exchange the authorization code for tokens, fetch group memberships,
    map groups to internal roles, and store the user in the session.
    """
    # Validate state to prevent CSRF
    if request.args.get("state") != session.pop("auth_state", None):
        return redirect(url_for("auth.login"))

    code = request.args.get("code")
    if not code:
        return redirect(url_for("auth.login"))

    scopes = current_app.config["AZURE_SCOPES"]

    # Exchange code for tokens
    result = current_app.msal_app.acquire_token_by_authorization_code(
        code,
        scopes=scopes,
        redirect_uri=current_app.config["AZURE_REDIRECT_URI"],
    )

    if "error" in result:
        current_app.logger.error("MSAL token error: %s", result.get("error_description"))
        return redirect(url_for("auth.login"))

    # Extract user claims from the id_token
    id_claims = result.get("id_token_claims", {})

    # Map Entra group Object IDs to internal role names
    group_ids = id_claims.get("groups", [])
    group_role_map = current_app.config.get("GROUP_ROLE_MAP") or {}
    roles = [
        group_role_map[gid]
        for gid in group_ids
        if gid in group_role_map
    ]

    # Determine region from a custom claim or default to US
    # (Can be refined later to pull from user profile or DB)
    region = "US"

    session["user"] = {
        "name": id_claims.get("name", ""),
        "email": id_claims.get("preferred_username", ""),
        "oid": id_claims.get("oid", ""),
        "roles": roles,
        "region": region,
    }
    session["access_token"] = result.get("access_token", "")

    return redirect(url_for("index"))


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------
@auth_bp.route("/logout")
def logout():
    """Clear the session and redirect to Entra ID's logout endpoint."""
    session.clear()
    logout_url = (
        f"{current_app.config['AZURE_AUTHORITY']}/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={url_for('auth.login', _external=True)}"
    )
    return redirect(logout_url)


# ---------------------------------------------------------------------------
# Profile — temporary landing page until dashboard is built
# ---------------------------------------------------------------------------
@auth_bp.route("/profile")
def profile():
    """Display the authenticated user's profile (temporary home screen)."""
    if "user" not in session:
        return redirect(url_for("auth.login"))

    return render_template("auth/profile.html", user=session["user"])
