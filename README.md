# Stallion

Modern customs declaration workspace with ASYCUDA-compatible export.

## Structure

- `backend/` FastAPI service (validation, XML export, lookups, templates, worksheet calc)
- `frontend/` UI workspace (to be wired from existing declaration-ace)
- `docs/` parity specs, UX specs, and sprint plans

## Quick start (backend)

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8022
```

Health:
- `GET /health`

Core endpoints:
- `GET /lookups/{kind}`
- `GET /templates`
- `POST /templates`
- `POST /worksheet/calculate`
- `POST /declarations/validate`
- `POST /declarations/export-xml`
- `POST /pack/generate`
- `GET /pack/file/{doc_id}`

## Quick start (frontend)

```bash
cd frontend
npm ci
npm run dev
```

Optional API base override:

```bash
export VITE_STALLION_API_URL=http://127.0.0.1:8021
```

Routes:
- `/` declarations workspace
- `/stallion/workbench` Stallion worksheet-first workbench

## Current Program Status (2026-02-23)

- Competitive scrape + content strategy package completed (`stallion/data`, `stallion/launch-kit`).
- ACE vs SADDEC technical comparison completed.
- Profile-based validator + fail-fast transformer completed under `../inbox_drive`.
- End-to-end dummy run passed for general + vehicle flows.
- Pending tonight: broker provides real enrichment fields; then production transformation + final XML export.

