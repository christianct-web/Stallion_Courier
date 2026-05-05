# Stallion Architecture Assessment + Refactor Plan (2026-02-23)

## Assessment Snapshot
- Detected pattern: **Layered architecture** (confidence: 55%)
- Codebase scanned: ~11,115 lines across 92 files
- Primary structural issues: oversized files and weak layer boundaries
- Critical layer violations found by tool: none explicit, but layering is under-defined

## High-Impact Findings
1. `backend/app/main.py` is oversized (1,148 lines) and likely mixes routing, validation, transformation, and pack generation concerns.
2. `frontend/src/pages/StallionWorkbench.tsx` is oversized (1,359 lines) and likely mixes orchestration + UI state + domain mapping.
3. `frontend/src/components/ui/sidebar.tsx` is oversized (638 lines).
4. `frontend/src/pages/DeclarationEditor.tsx` has high import count (34), indicating broad coupling.
5. Current package/dependency analysis is incomplete at monorepo root level; dependency checks should run per backend/frontend package roots.

## Top 5 Changes (Impact vs Effort)

### 1) Split backend main into feature modules (High impact / Medium effort)
- Target split:
  - `api/routes/declarations.py`
  - `api/routes/pack.py`
  - `services/validation_service.py`
  - `services/xml_export_service.py`
  - `services/pack_service.py`
- Benefit: cleaner ownership, testability, lower regression risk.

### 2) Introduce explicit backend layer boundaries (High impact / Medium effort)
- Add structure:
  - `domain/` (core models/rules)
  - `application/` (use-cases)
  - `infrastructure/` (supabase/files/pdf adapters)
  - `api/` (FastAPI routes)
- Benefit: isolates business logic from transport/storage details.

### 3) Refactor StallionWorkbench into composable modules (High impact / Medium effort)
- Split into:
  - `hooks/` (state + side effects)
  - `sections/` (form segments)
  - `services/` (API calls)
  - `mappers/` (payload transforms)
- Benefit: faster front-end iteration and lower bug surface.

### 4) Create declaration profile engine (General vs Vehicle) in backend (High impact / Low effort)
- Move profile logic from scripts into backend service used by API endpoints.
- Benefit: single source of truth for validation and transform rules.

### 5) Add architecture guardrails in CI (Medium impact / Low effort)
- Add checks for:
  - max file lines threshold warning
  - import count threshold warning
  - smoke validation for profile-based XML checks
- Benefit: prevents architectural debt from re-accumulating.

## 7-Day Execution Sequence
1. ✅ Day 1-2: backend split (`main.py` decomposition) — completed with services extraction.
2. Day 3: profile engine extraction and shared rules module.
3. Day 4-5: frontend `StallionWorkbench` decomposition.
4. Day 6: CI guardrails + script integration.
5. Day 7: regression test pass + docs update.

## Definition of Done
- `backend/app/main.py` < 400 lines
- `StallionWorkbench.tsx` < 500 lines
- profile validation/transform rules callable from API + CLI scripts
- CI warns on file size/import bloat
- no regression in XML export + pack generation smoke tests
