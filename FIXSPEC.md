# Stallion Courier — Remediation Spec (v1)
**Date:** 2026-07-14 · **Driven by:** External security/integrity review of 2026-06-07
**Scope of this pass:** Phase 1 (security) + Phase 2 (customs correctness). Phase 3 (Postgres, real user auth) is specified but not implemented here.

---

## Phase 1 — Security (implemented in this patch)

### F1. Production must fail closed without authentication
**Finding:** Auth only activates when `STALLION_API_KEY` is set; frontend never sends it, so production is almost certainly open.
**Fix:**
- `main.py`: new `STALLION_ENV` variable. When `STALLION_ENV=production`, startup **raises** if `STALLION_API_KEY` is unset/empty. Impossible to boot an open production API.
- `middleware_auth.py`: key comparison switched to `hmac.compare_digest` (constant-time).
- `/docs`, `/openapi.json`, `/redoc` are **no longer public** in production (only `/health` stays open).

### F2. Frontend sends the API key; TLS terminates at Caddy
**Finding:** Frontend has no `X-API-Key`; Netlify proxies to `http://187.77.18.154:8030` in plaintext, IP disclosed in repo.
**Fix:**
- All three API clients (`stallionApi.ts`, `courierApi.ts`, `sheetApi.ts`) attach `X-API-Key` from `VITE_STALLION_API_KEY` on every request, including file downloads via a new authenticated blob-fetch helper.
- `_redirects` rewritten to a placeholder HTTPS hostname (no IP, no port).
- New `deploy/Caddyfile` + `deploy/README.md`: Caddy terminates TLS on the VPS, reverse-proxies to `127.0.0.1:8030`, and UFW rules close public 8030. Backend binds to localhost only.
> **Operational note:** the key lands in the built JS bundle. This is a *shared-secret* stopgap, not user auth — acceptable for a single-brokerage deployment behind HTTPS, replaced by real auth in Phase 3.

### F3. CORS fails closed in production
**Finding:** default `*` origins **with** `allow_credentials=True` — invalid/unsafe combination.
**Fix:** In production, startup raises unless `STALLION_CORS_ORIGINS` is an explicit list. `allow_credentials` is only enabled when origins are explicit. Dev keeps wildcard without credentials.

### F4. Mutations are no longer auto-retried
**Finding:** Timed-out POSTs are retried → duplicate declarations/reviews/documents.
**Fix:** All three API clients retry **GET only**. POST/PATCH/DELETE fail loudly on timeout.

---

## Phase 2 — Customs integrity (implemented in this patch)

### F5. Zero is a value, not a gap
**Finding:** `worksheet.get("duty") or computed` recalculates when a broker deliberately enters 0; CUF `or 80` same bug.
**Fix:** `worksheet_service.calculate_from_dict` uses explicit `is None` presence checks (`_override_or`). `duty=0`, `vat=0`, `customs_user_fee=0` are now honored. Default CUF 80 applies **only when the field is absent**.

### F6. Missing regulatory data blocks export — no silent TT/US/4000
**Finding:** Missing origin/export/destination country and CPC default silently into declaration data and XML.
**Fix:**
- `preflight_workbench` now **errors** on: missing item `countryOfOrigin`, missing item `cpc`, missing header export/destination country (direction-aware: imports need export-country + item origins; exports need destination).
- `pack_service` PDF: `item.get("cpc") or "4000"` fallback removed — missing CPC renders as blank and is already blocked upstream by preflight.
> Residual: `declaration_service.py` still contains legacy `"US"/"TT"/"United States"` defaults on internal field-mapping paths. They are now unreachable for pack export (preflight blocks first), but should be deleted entirely in Phase 3 when the field model is consolidated. Flagged inline with `# FIXME(F6)`.

### F7. Only `approved` declarations can generate packs
**Finding:** `pending_review` records could produce uploadable C82 XML.
**Fix:** `pack_generate` gate is `approved` only. 409 message tells the user to complete broker review.

### F8. Worksheet PDF renders ALL items across pages
**Finding:** PDF truncated to first 10 items (or fewer when the page filled) with no continuation — PDF and XML could diverge.
**Fix:** Item loop paginates: when the page fills, a "continued…" marker is drawn, a new page starts, the table header + rate row are redrawn, and rendering continues. Totals and duty summary always land after the final item. An item-count line (`Items rendered: N of N`) prints under the table as a reconciliation check.

### F9. Enforced status lifecycle
**Finding:** Any state could jump to any other state (created → receipted, rejected → submitted).
**Fix:** `declarations_review` enforces a transition map:
```
draft/needs_correction/rejected → pending_review
pending_review                  → approved | needs_correction | rejected
approved                        → submitted | needs_correction
submitted                       → receipted | needs_correction
receipted                       → (terminal)
```
Invalid transitions return 409 with the allowed set.

### F10. Review identity hardening (interim)
**Finding:** `reviewed_by` / `reviewed_at` accepted verbatim from the request body.
**Fix (interim until real auth):**
- `reviewed_at` is **always stamped server-side** (UTC now); client value ignored.
- If `STALLION_BROKERS` env var is set (comma-separated names), `reviewed_by` must match one of them or the request is rejected.
- Review endpoint **no longer accepts content patches** (`header`/`worksheet`/`items` stripped) — reviewing and editing are now separate acts.

### F11. Approved declarations are immutable
**Finding:** General upsert could silently rewrite an approved declaration.
**Fix:** `declarations_upsert` rejects content changes to `approved`/`submitted`/`receipted` records with 409 — unless the request sets `"revise": true`, which applies the edit **and** resets status to `draft`, clears `reviewed_by`/`reviewed_at`, and records `revised_at` + `revision_note`. Approval can never survive a material edit.

---

## Phase 3 — Specified, NOT in this patch (next sprint)
1. **PostgreSQL migration** (house stack): declarations, clients, couriers, sheets → transactional tables; kills the lost-update race (review finding 5) properly. JSON file locks are a stopgap.
2. **Real user auth**: per-user login (JWT or session), roles (clerk/broker/admin), per-tenant ownership on every row. Removes the shared-key stopgap and completes F10.
3. **Delete regulatory defaults** in `declaration_service.py` field mapping (`FIXME(F6)` markers) once the field model is unified.
4. **Single calculation engine**: fold remaining calculator variants onto `calculate_from_dict`; property-based tests comparing PDF vs XML vs API numbers.
5. **AI tariff grounding**: Claude suggests HS candidates only; rates always re-resolved from `tt_tariff_db`. Reject any AI-supplied rate not present in the local dataset.
6. **Extraction hardening**: upload size limit, magic-byte MIME check, async Anthropic client, queue for multi-file jobs, strict Pydantic schema on extraction output.
7. **Ops**: idempotency keys on create/review/generate, append-only audit log, nightly JSON/DB backup + tested restore, CI gate running the full test suite, pinned requirements.
8. **Broker sign-off** on courier rules (explicit release blocker in source) — Jason.

## Deployment runbook (after applying this patch)
1. VPS: install Caddy, apply `deploy/Caddyfile` with your real domain; point DNS `api.stallion.<yourdomain>` → VPS.
2. `ufw deny 8030/tcp` (and bind uvicorn to `127.0.0.1`). Only 80/443 public.
3. Backend env: `STALLION_ENV=production`, `STALLION_API_KEY=<64-hex random>`, `STALLION_CORS_ORIGINS=https://<your-netlify-site>.netlify.app`, `STALLION_BROKERS=Jason Maule,Crystal Williams`.
4. Netlify env: `VITE_STALLION_API_KEY=<same key>`; update `_redirects` to `https://api.stallion.<yourdomain>/:splat`; redeploy.
5. Verify: `curl https://api.../declarations` → 401; with header → 200; `curl http://IP:8030` → connection refused.
6. **Rotate the key**: the old IP/port were public in the repo; treat all data as potentially viewed and confirm with JMC what was live during the exposure window.
