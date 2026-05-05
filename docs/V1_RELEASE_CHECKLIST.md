# Stallion v1 Release Checklist

Date: 2026-02-15 (UTC)

## Scope
Stallion v1 = worksheet-first workflow with API-backed lookups/templates, pack generation, and downloadable artifacts.

## Acceptance Criteria

- [x] Backend health endpoint responds (`GET /health`)
- [x] Worksheet calculator responds (`POST /worksheet/calculate`)
- [x] Template save/list endpoints respond (`POST /templates`, `GET /templates`)
- [x] Pack generation responds (`POST /pack/generate`)
- [x] Pack file download endpoint responds (`GET /pack/file/{doc_id}`)
- [x] C82 declaration validation passes in generated pack (`c82Validation.status == pass`)
- [x] Generated pack includes all core docs:
  - [x] worksheet_pdf
  - [x] c82_sad_xml
  - [x] information_page
  - [x] sad_pdf
  - [x] assessment_notice
  - [x] receipt
  - [x] container_page when container rows are present

## Frontend

- [x] Frontend copied/wired into `stallion/frontend`
- [x] Dependency install succeeds (`npm ci`)
- [x] Production build succeeds (`npm run build`)
- [x] Unit test suite passes (`npm run test -- --run`)

## QA Notes

Smoke parity tests were run against `/pack/generate` with:
1) sea shipment + container
2) air shipment + no container

Results:
- Pack status generated in all cases
- C82 validation pass in all cases
- All expected artifact URLs downloadable

## Operator Runbook

Backend:
```bash
cd stallion/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8020
```

Frontend:
```bash
cd stallion/frontend
npm ci
npm run dev
```

Optional API override:
```bash
export VITE_STALLION_API_URL=http://127.0.0.1:8020
```

## Release Decision

Status: **READY FOR V1 RELEASE**

Post-release recommended backlog:
- Exact visual parity refinements for PDFs against legacy forms
- Expanded integration tests with fixed golden sample payloads
- OCR + HS suggestions (phase 2)
