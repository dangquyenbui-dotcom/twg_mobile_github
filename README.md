# TWG Mobile

Mobile-first Progressive Web App for The Wheel Group sales team.
Built with Flask, Microsoft Entra ID SSO, and SQL Server.

## Prerequisites

- Python 3.10+
- ODBC Driver 17 for SQL Server
- Access to PRO05 (US) and/or PRO06 (CA) SQL Server instances
- An Azure App Registration with Entra ID configured

## Setup

```bash
# Clone and enter the project
git clone https://github.com/your-org/twg_mobile_github.git
cd twg_mobile_github

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
.venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your Azure, database, and role group values
```

## Running

```bash
# Development
flask --app twg_mobile.app:create_app run --debug

# Production (example with gunicorn)
gunicorn "twg_mobile.app:create_app()" --bind 0.0.0.0:8000
```

## Project Structure

```
twg_mobile/
  app.py              # Flask app factory
  config.py           # Environment-based configuration
  db.py               # pyodbc connection helper (US/CA)
  auth/               # Entra ID SSO login/logout/callback
  modules/
    orders/           # Order entry & dashboard
    customers/        # Customer lookup
    inventory/        # Inventory search
  static/             # CSS, JS, PWA manifest, service worker
  templates/          # Jinja2 templates
```

## Environment Variables

See `.env.example` for the full list. Key groups:

- **AZURE_*** — Entra ID app registration credentials
- **DB_*** — SQL Server connection details for US and CA
- **GROUP_*** — Entra Security Group Object IDs mapped to roles
- **APP_VERSION** — Appended to static asset URLs for Cloudflare cache busting
