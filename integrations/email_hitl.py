"""Email-based human-in-the-loop (Phase 3, Dev B — stretch, off the critical path).

When `EMAIL_HITL_ENABLED=true` and SMTP/IMAP credentials are configured, this
sends an approval-request email for an escalation and polls the inbox for a
reply containing APPROVE / REJECT / ADJUST <budget>. If unconfigured or
anything fails, every function is a silent no-op so the orchestrator's
primary inline-alert HITL (backend/human_response_store.py) remains the
working path regardless.
"""

import imaplib
import email
import os
import re
import smtplib
import time
from email.message import EmailMessage

EMAIL_HITL_ENABLED = os.getenv("EMAIL_HITL_ENABLED", "false").lower() == "true"

SMTP_HOST = os.getenv("EMAIL_HITL_SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("EMAIL_HITL_SMTP_PORT", "587"))
IMAP_HOST = os.getenv("EMAIL_HITL_IMAP_HOST", "imap.gmail.com")
EMAIL_USER = os.getenv("EMAIL_HITL_USER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_HITL_PASSWORD", "")
REVIEWER_EMAIL = os.getenv("EMAIL_HITL_REVIEWER", "")

_DECISION_RE = re.compile(r"\b(APPROVE|REJECT|ADJUST)\b\s*([\d.]+)?", re.IGNORECASE)


def is_configured() -> bool:
    return bool(EMAIL_HITL_ENABLED and EMAIL_USER and EMAIL_PASSWORD and REVIEWER_EMAIL)


def send_review_request(session_id: str, question: str, best_offer: dict | None) -> bool:
    """Send a human-readable approval request. Returns False (no-op) if
    email HITL isn't configured."""
    if not is_configured():
        return False

    body_lines = [
        question,
        "",
        "Reply with one of:",
        "  APPROVE",
        "  REJECT",
        "  ADJUST <new budget in EUR>",
    ]
    if best_offer:
        body_lines.insert(1, f"Recommended offer: {best_offer.get('seller_name')} — "
                              f"{best_offer.get('product')} at EUR{best_offer.get('price_eur')}")

    msg = EmailMessage()
    msg["Subject"] = f"[Pactum] Approval needed — session {session_id}"
    msg["From"] = EMAIL_USER
    msg["To"] = REVIEWER_EMAIL
    msg["X-Pactum-Session"] = session_id
    msg.set_content("\n".join(body_lines))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(EMAIL_USER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:
        return False


def poll_for_decision(session_id: str, timeout: float = 300.0, interval: float = 10.0) -> dict | None:
    """Poll the inbox for a reply referencing `session_id`.

    Returns {"decision": "approve"|"reject"|"adjust", "adjusted_budget_eur": float | None}
    or None if unconfigured, on error, or if `timeout` elapses without a reply.
    """
    if not is_configured():
        return None

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        decision = _check_inbox_once(session_id)
        if decision is not None:
            return decision
        time.sleep(interval)
    return None


def _check_inbox_once(session_id: str) -> dict | None:
    try:
        with imaplib.IMAP4_SSL(IMAP_HOST) as imap:
            imap.login(EMAIL_USER, EMAIL_PASSWORD)
            imap.select("INBOX")
            _, data = imap.search(None, "UNSEEN")
            for msg_num in data[0].split():
                _, msg_data = imap.fetch(msg_num, "(RFC822)")
                raw = msg_data[0][1]
                parsed = email.message_from_bytes(raw)
                if session_id not in parsed.get("Subject", "") and session_id not in parsed.get("X-Pactum-Session", ""):
                    continue
                body = _extract_text(parsed)
                decision = _parse_decision(body)
                if decision:
                    return decision
    except Exception:
        return None
    return None


def _extract_text(parsed) -> str:
    if parsed.is_multipart():
        for part in parsed.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode(errors="ignore")
        return ""
    return parsed.get_payload(decode=True).decode(errors="ignore")


def _parse_decision(body: str) -> dict | None:
    match = _DECISION_RE.search(body)
    if not match:
        return None

    word = match.group(1).upper()
    if word == "APPROVE":
        return {"decision": "approve", "adjusted_budget_eur": None}
    if word == "REJECT":
        return {"decision": "reject", "adjusted_budget_eur": None}
    if word == "ADJUST" and match.group(2):
        return {"decision": "adjust", "adjusted_budget_eur": float(match.group(2))}
    return None
