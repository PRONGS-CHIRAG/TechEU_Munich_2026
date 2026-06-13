# Aikido Security Notes

## Purpose

Pactum handles confidential procurement specifications and commercial negotiation terms. Before the demo we ran a manual security pass over the codebase, modeled on the checks an Aikido scan covers (secrets, dependency CVEs, exposed credentials), to reduce risk.

## Scan Summary

- No hardcoded API keys detected — verified via repo-wide grep for key-shaped strings.
- All secrets loaded from environment variables via `.env` (git-ignored).
- `.env.example` contains only variable names with empty values.
- No known vulnerable dependency versions identified in `requirements.txt` / `frontend/package.json` at time of review.

> An automated Aikido scan was not run for this submission (no org access during the hackathon window). The findings above come from the manual review described here. Re-run an Aikido scan against the repo and drop the report screenshot in `assets/screenshots/aikido_scan.png` before a production deploy.

## Security Assumptions

- All external API calls (Pioneer, Tavily, fal) use HTTPS.
- API keys are never logged or exposed in responses.
- Demo mode (`DEMO_MODE=true`) allows the app to run without real credentials.
- No real procurement transactions or payments are processed.
- Synthetic data only — no real buyer or seller PII.

## Mitigations

| Risk | Mitigation |
|------|-----------|
| Hardcoded secrets | All secrets in `.env`, loaded via `python-dotenv` |
| API key exposure | Keys read from env; never printed or returned to frontend |
| Dependency vulnerabilities | Manual review before demo; run Aikido (or `npm audit` / `pip-audit`) before production |
| Demo failure from API outage | Fallback outputs in `integrations/fallback_outputs.py`, replay transcripts in `data/transcripts/` |
| Negotiation data leakage | Synthetic data only; no real company information |

## Notes

- `.env` is in `.gitignore`.
- `requirements.txt` pinned to stable versions.
- No Aikido screenshot is included in `assets/screenshots/` for this submission (see Purpose).
