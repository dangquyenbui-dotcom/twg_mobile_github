"""
TWG Mobile — Auth Decorators
Role-based access control for route protection.
"""

from functools import wraps
from flask import session, redirect, url_for, abort


def login_required(f):
    """Redirect to login if the user is not authenticated."""

    @wraps(f)
    def decorated(*args, **kwargs):
        if "user" not in session:
            return redirect(url_for("auth.login"))
        return f(*args, **kwargs)

    return decorated


def role_required(*allowed_roles):
    """
    Restrict access to users who hold at least one of the given roles.

    Usage:
        @role_required("admin", "sales_manager")
        def manager_dashboard(): ...
    """

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if "user" not in session:
                return redirect(url_for("auth.login"))

            user_roles = session["user"].get("roles", [])
            if not any(role in user_roles for role in allowed_roles):
                abort(403)

            return f(*args, **kwargs)

        return decorated

    return decorator
