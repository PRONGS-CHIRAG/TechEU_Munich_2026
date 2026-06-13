import os
import sys
from urllib.parse import urlparse


def get_env_str(key: str, default: str = "") -> str:
    return str(os.getenv(key, default)).strip()


def get_env_bool(key: str, default: bool = False) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def get_env_url(key: str, default: str = "") -> str:
    """Return a sanitized URL string from environment or default.

    Accepts only http/https schemes and ensures there's a network location.
    On invalid values, emits a warning to stderr and returns the default.
    """
    val = get_env_str(key, default)
    if not val:
        return default
    parsed = urlparse(val)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        print(f"WARNING: invalid URL for {key}: {val}", file=sys.stderr)
        return default
    return val.rstrip("/")
