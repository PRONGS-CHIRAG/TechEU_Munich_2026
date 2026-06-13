"""In-memory pause/resume bridge for inline human-in-the-loop.

`run_demo_stream()` blocks on `wait_for_response()` after emitting a
`human_alert` event; `POST /api/human-response` calls `submit_response()`
from a different request/thread to wake it back up. Single-process,
in-memory only — fine for a hackathon demo, not for multi-worker deployments.
"""

import threading

_lock = threading.Lock()
_events: dict[str, threading.Event] = {}
_responses: dict[str, dict] = {}


def wait_for_response(session_id: str, timeout: float = 300.0) -> dict | None:
    """Block until a response is submitted for `session_id` or `timeout` elapses.

    Returns the response dict, or None on timeout.
    """
    event = threading.Event()
    with _lock:
        _events[session_id] = event

    received = event.wait(timeout)

    with _lock:
        _events.pop(session_id, None)
        return _responses.pop(session_id, None) if received else None


def submit_response(session_id: str, response: dict) -> bool:
    """Wake up a pending `wait_for_response()` call. Returns False if no run
    is currently waiting on `session_id` (e.g. already timed out)."""
    with _lock:
        event = _events.get(session_id)
        if event is None:
            return False
        _responses[session_id] = response
        event.set()
    return True
