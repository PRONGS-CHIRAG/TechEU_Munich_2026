import os
from integrations.fallback_outputs import fallback_pioneer_labels

PIONEER_API_KEY = os.getenv("PIONEER_API_KEY", "")
PIONEER_BASE_URL = os.getenv("PIONEER_BASE_URL", "")
TIMEOUT = 12


def classify_message(message: str) -> dict:
    if not PIONEER_API_KEY or not PIONEER_BASE_URL:
        return fallback_pioneer_labels(message)

    try:
        import requests

        response = requests.post(
            f"{PIONEER_BASE_URL}/classify",
            json={"message": message},
            headers={"Authorization": f"Bearer {PIONEER_API_KEY}"},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        return response.json()
    except Exception:
        return fallback_pioneer_labels(message)
