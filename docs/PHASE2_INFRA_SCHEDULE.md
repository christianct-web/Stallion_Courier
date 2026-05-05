# Stallion Phase 2 Infra Schedule (90 Days)

Date: 2026-02-16 (UTC)
Owner: Christian / 28Keira
Cadence: Weekly checkpoints

## Week 1 (Feb 16–Feb 22)
- Finalize infra architecture + tenancy rules (shared/dedicated)
- Create environment matrix: dev / staging / prod
- Define tenant ID propagation standard (API, DB, jobs)
- Create RBAC matrix and permission tests
- Deliverables:
  - `INFRASTRUCTURE_SCALING_PLAN.md` approved
  - Tenant isolation checklist draft

## Week 2 (Feb 23–Mar 1)
- Add queue system (Redis + worker process)
- Move heavy jobs (pack generation/OCR prep) to async worker
- Add job status tracking + retries + dead-letter handling
- Deliverables:
  - Worker service running in staging
  - Async job pipeline for 1 core workflow

## Week 3 (Mar 2–Mar 8)
- Implement usage metering primitives
  - per-tenant job count
  - storage usage
  - API call counters
- Add basic quota enforcement hooks
- Deliverables:
  - Usage table/schema + dashboard query set

## Week 4 (Mar 9–Mar 15)
- Observability baseline
  - Sentry integration
  - structured logs
  - basic service metrics
- Add alert thresholds for queue failures + 5xx spikes
- Deliverables:
  - Ops dashboard v1

## Week 5 (Mar 16–Mar 22)
- Backup/restore policy hardening
- Monthly restore drill script and checklist
- Deliverables:
  - Restore test evidence logged

## Week 6 (Mar 23–Mar 29)
- Dedicated tenant template design
  - isolated DB/bucket naming conventions
  - deployment variable schema
- Deliverables:
  - Dedicated tenant deployment spec v1

## Week 7 (Mar 30–Apr 5)
- CI/CD hardening
  - migration safety checks
  - staged rollout + rollback script
- Deliverables:
  - Deployment runbook v1

## Week 8 (Apr 6–Apr 12)
- Security pass
  - tenant boundary tests
  - audit log export sanity
  - key rotation procedure
- Deliverables:
  - Security checklist pass report

## Week 9–10 (Apr 13–Apr 26)
- Pilot-readiness optimization
  - performance tuning for OCR/doc jobs
  - per-tenant rate controls
- Deliverables:
  - Pilot scaling report

## Week 11–12 (Apr 27–May 10)
- Enterprise readiness package
  - SSO/SAML design note
  - dedicated tenant ops handoff docs
- Deliverables:
  - Enterprise deployment brief

---

## Active To-Do Queue (Immediate)
1. Draft tenant isolation checklist doc
2. Add RBAC permission test plan
3. Build queue worker scaffold in backend
4. Define usage metering schema
5. Set staging monitoring baseline

## Operating Rhythm
- Daily: 30-minute build sync
- Weekly: milestone review + risks
- Bi-weekly: architecture checkpoint and reprioritization

## Status Update — 2026-02-23

- Added competitive dataset analysis and launch kit assets (`stallion/data`, `stallion/launch-kit`).
- Completed ACE→SADDEC comparison and profile-based validation workflow in `workspace/inbox_drive`.
- Transformer pipeline validated end-to-end (dummy enrichment test pass); production run pending broker-provided real values.
- Next execution: replace dummy values, run final transform, validate, and package submission-ready XML.
