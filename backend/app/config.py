"""Settings read from environment variables, with local-development defaults."""

import os

UPSTREAM_URL = os.environ.get("UPSTREAM_URL", "http://127.0.0.1:8081").rstrip("/")
UPSTREAM_API_KEY = os.environ.get("UPSTREAM_API_KEY", "local-dev-key")

CONNECT_TIMEOUT = float(os.environ.get("UPSTREAM_CONNECT_TIMEOUT", "2"))
READ_TIMEOUT = float(os.environ.get("UPSTREAM_READ_TIMEOUT", "5"))
MAX_PUT_RETRIES = int(os.environ.get("UPSTREAM_MAX_PUT_RETRIES", "2"))
