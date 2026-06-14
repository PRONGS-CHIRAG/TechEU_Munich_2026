"""In-memory human-in-the-loop session coordination for streamed demo runs."""

from __future__ import annotations

from queue import Empty, Queue
from threading import Lock
from typing import Any


_sessions: dict[str, Queue[dict[str, Any]]] = {}
_lock = Lock()


def create_session(session_id: str) -> None:
    """Register a stream session before it can emit a human alert."""
    with _lock:
        _sessions[session_id] = Queue(maxsize=1)


def close_session(session_id: str) -> None:
    """Remove a session after its stream completes or errors."""
    with _lock:
        _sessions.pop(session_id, None)


def submit_response(session_id: str, response: dict[str, Any]) -> bool:
    """Submit a human response to a waiting stream."""
    with _lock:
        queue = _sessions.get(session_id)
    if queue is None:
        return False

    # Keep the newest response if a user clicks twice quickly.
    try:
        queue.get_nowait()
    except Empty:
        pass
    queue.put(response)
    return True


def wait_for_response(session_id: str, timeout_seconds: int = 600) -> dict[str, Any]:
    """Block until a human response arrives, or return a timeout fallback."""
    with _lock:
        queue = _sessions.get(session_id)
    if queue is None:
        return {
            "action": "auto_continue",
            "note": "No active human review session was found.",
            "timed_out": False,
        }

    try:
        return queue.get(timeout=timeout_seconds)
    except Empty:
        return {
            "action": "auto_continue",
            "note": "Human review timed out; continuing automatically.",
            "timed_out": True,
        }
