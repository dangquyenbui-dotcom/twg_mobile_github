"""
TWG Mobile — Configuration
Loads all settings from environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration loaded from environment variables."""

    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
    FLASK_ENV = os.environ.get("FLASK_ENV", "production")
    DEBUG = FLASK_ENV == "development"

    # App version — appended to static asset URLs for Cloudflare cache busting
    APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")

    # Session — server-side filesystem sessions
    SESSION_TYPE = "filesystem"
    SESSION_FILE_DIR = os.path.join(os.path.dirname(__file__), "flask_session")
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True

    # ---------------------------------------------------------------------------
    # Microsoft Entra ID (Azure AD) — MSAL configuration
    # ---------------------------------------------------------------------------
    AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID", "")
    AZURE_CLIENT_SECRET = os.environ.get("AZURE_CLIENT_SECRET", "")
    AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID", "")
    AZURE_REDIRECT_URI = os.environ.get("AZURE_REDIRECT_URI", "")
    AZURE_AUTHORITY = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"

    # Scopes requested during login
    AZURE_SCOPES = ["User.Read"]

    # ---------------------------------------------------------------------------
    # Database — dual SQL Server connections (US = PRO05, CA = PRO06)
    # ---------------------------------------------------------------------------
    DB_US_SERVER = os.environ.get("DB_US_SERVER", "")
    DB_US_NAME = os.environ.get("DB_US_NAME", "")
    DB_CA_SERVER = os.environ.get("DB_CA_SERVER", "")
    DB_CA_NAME = os.environ.get("DB_CA_NAME", "")
    DB_USERNAME = os.environ.get("DB_USERNAME", "")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

    # ---------------------------------------------------------------------------
    # Role ↔ Entra ID Security Group mapping
    # Keys = Entra Security Group Object IDs, values = internal role names.
    # ---------------------------------------------------------------------------
    GROUP_SALES_REP = os.environ.get("GROUP_SALES_REP", "")
    GROUP_INSIDE_SALES = os.environ.get("GROUP_INSIDE_SALES", "")
    GROUP_SALES_MANAGER = os.environ.get("GROUP_SALES_MANAGER", "")
    GROUP_ADMIN = os.environ.get("GROUP_ADMIN", "")

    # Inverted lookup used by auth callback: group Object ID → role name.
    # Built at import time; empty strings are excluded so blank env vars
    # don't pollute the map.
    @staticmethod
    def _build_group_role_map():
        mapping = {}
        pairs = [
            ("GROUP_SALES_REP", "sales_rep"),
            ("GROUP_INSIDE_SALES", "inside_sales"),
            ("GROUP_SALES_MANAGER", "sales_manager"),
            ("GROUP_ADMIN", "admin"),
        ]
        for env_key, role in pairs:
            gid = os.environ.get(env_key, "")
            if gid:
                mapping[gid] = role
        return mapping

    GROUP_ROLE_MAP = _build_group_role_map()
