# Aikido Security Notes

## Purpose

Pactum handles confidential procurement specifications and commercial negotiation terms. We used Aikido to scan the codebase and reduce security risk before the demo.

## Scan Summary

- No hardcoded API keys detected.
- All secrets loaded from environment variables via `.env` (git-ignored).
- `.env.example` contains only variable names with empty values.
- No known vulnerable dependency versions at time of scan.

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
| Dependency vulnerabilities | Aikido scan run before demo |
| Demo failure from API outage | Fallback outputs in `integrations/fallback_outputs.py` |
| Negotiation data leakage | Synthetic data only; no real company information |

## Notes

- `.env` is in `.gitignore`.
- `requirements.txt` pinned to stable versions.
- Aikido screenshot saved in `assets/screenshots/`.
