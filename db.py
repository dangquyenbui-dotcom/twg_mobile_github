"""
TWG Mobile — Database Connection Helper
Provides pyodbc connections to US (PRO05) and CA (PRO06) SQL Server instances.
The user's region (stored in session) determines which connection is used.
"""

import pyodbc
from flask import current_app, session


def _build_connection_string(server, database):
    """Build a SQL Server connection string from config values."""
    username = current_app.config["DB_USERNAME"]
    password = current_app.config["DB_PASSWORD"]
    return (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password};"
        f"TrustServerCertificate=yes;"
    )


def get_db_connection(region=None):
    """
    Return a pyodbc connection for the given region.

    Args:
        region: "US" or "CA". If None, reads from the session user profile.

    Returns:
        pyodbc.Connection

    Raises:
        ValueError: if the region is not recognised.
    """
    if region is None:
        user = session.get("user", {})
        region = user.get("region", "US")

    region = region.upper()

    if region == "US":
        server = current_app.config["DB_US_SERVER"]
        database = current_app.config["DB_US_NAME"]
    elif region == "CA":
        server = current_app.config["DB_CA_SERVER"]
        database = current_app.config["DB_CA_NAME"]
    else:
        raise ValueError(f"Unknown region: {region}")

    return pyodbc.connect(_build_connection_string(server, database))


def execute_query(sql, params=None, region=None):
    """
    Execute a read query and return all rows as a list of dicts.

    Args:
        sql: SQL query string with ? placeholders.
        params: Tuple of parameter values (or None).
        region: "US" or "CA" (defaults to session region).

    Returns:
        List of dicts, one per row.
    """
    conn = get_db_connection(region)
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params or ())
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


def execute_command(sql, params=None, region=None):
    """
    Execute a write command (INSERT/UPDATE/DELETE) and return rows affected.

    Args:
        sql: SQL command string with ? placeholders.
        params: Tuple of parameter values (or None).
        region: "US" or "CA" (defaults to session region).

    Returns:
        Number of rows affected.
    """
    conn = get_db_connection(region)
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params or ())
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()
