# Running Pactum Locally

Use two terminals from the repo root:

```bash
cd /Users/chiragnvijay/Desktop/Projects/TechEU_Munich_2026
```

## 1. Backend

Start FastAPI on port `8000`:

```bash
uvicorn backend.api:app --reload --port 8000
```

Replay mode, with no live API keys:

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```

Backend health check:

```bash
curl -s http://127.0.0.1:8000/api/config
```

Expected live-mode response:

```json
{"demo_mode":false}
```

## 2. Frontend

Start Next.js from `frontend/`:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is occupied, Next.js may choose another port such as `3001`.

## 3. Demo Login

Use one of these demo accounts:

```text
Buyer:  buyer / 123
Seller: seller / 123
Root:   root / root
```

## 4. Quick Checks

Frontend check:

```bash
curl -I -s http://127.0.0.1:3000/
```

Scenario API check:

```bash
curl -s http://127.0.0.1:8000/api/scenarios
```

## 5. Troubleshooting

If the UI shows `Error — [Errno 2] No such file or directory`, check that the backend process is running from this repo and not from an old copied or trashed folder:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -p <PID> | rg cwd
```

The backend `cwd` should be:

```text
/Users/chiragnvijay/Desktop/Projects/TechEU_Munich_2026
```

If it is not, stop the stale process and restart the backend from the repo root.
