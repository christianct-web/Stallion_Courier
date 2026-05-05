# Stallion Infrastructure & Scale Plan

Date: 2026-02-16 (UTC)
Owner: Christian / 28Keira
Status: Approved baseline (Hybrid tenancy)

## 1) Strategic Direction
Adopt a **Hybrid tenancy model**:
- Default clients: multi-tenant shared platform
- Enterprise/regulated clients: single-tenant dedicated stack

This gives speed + margin early, with an upgrade path for higher-isolation clients.

## 2) Deployment Models

### A. Shared SaaS (default)
- Domain: `app.stallion.ai`
- Tenant isolation via `tenant_id` + strict service-level filters
- Per-tenant quotas and feature flags

### B. Dedicated Tenant (enterprise)
- Domain: `clientname.stallion.ai` or customer domain
- Isolated app runtime + Postgres + object storage bucket
- Optional isolated VPC/network controls

## 3) Reference Architecture
- Edge: Cloudflare (DNS/TLS/WAF/rate limits)
- App API: FastAPI backend containers
- Frontend: static build deploy (CDN-backed)
- Worker tier: async queue workers for OCR, pack generation, heavy jobs
- Data:
  - Postgres (core transactional)
  - Redis (queues/cache/rate limits)
  - S3-compatible object store (docs/uploads)
- Observability:
  - Logs (Loki/ELK)
  - Metrics (Prometheus/Grafana)
  - Errors (Sentry)
- Secrets: managed secret store (no secrets in repo)

## 4) Security & Compliance Baseline
- RBAC roles: owner/admin/operator/viewer
- Immutable audit logs + export
- Encryption in transit + at rest
- Per-tenant keying and retention policy controls
- Backup policy + restore drill schedule
- Enterprise path: SSO/SAML + stronger data isolation profile

## 5) Scale Phases

### Phase 0 (now, <10 clients)
- Single production environment
- Managed Postgres + Redis
- 1+ worker process
- Nightly backups, monthly restore test

### Phase 1 (10–50 clients)
- Separate API and worker scaling
- Queue depth-based worker autoscaling
- Strong per-tenant quota controls

### Phase 2 (50–200 clients)
- Tenant sharding strategy
- Dedicated worker pools for high-volume OCR tenants
- Regional latency optimization (if needed)

### Phase 3 (200+ clients)
- Provisioning control plane
- Terraform modules for dedicated tenant spin-up
- Cost allocation dashboards by tenant

## 6) Non-Negotiables for Build
- Tenant-safe code patterns from day 1
- Background jobs for all heavy workflows
- Migrations must be backward-compatible
- Feature flags for risky rollouts
- Rollback runbook maintained

## 7) Key Risks & Mitigation
- Risk: noisy neighbors on shared tier
  - Mitigation: quotas + worker pool isolation + rate limiting
- Risk: data leakage across tenants
  - Mitigation: strict tenancy middleware, automated tests, audit trails
- Risk: OCR cost spikes
  - Mitigation: per-tenant usage caps + overage model + worker controls

## 8) Immediate Build Priorities
1. Implement tenant model + RBAC hardening checks
2. Introduce queue worker for OCR/doc generation
3. Add observability stack baseline (errors/logs/metrics)
4. Define shared-vs-dedicated tenant promotion runbook
5. Add usage metering primitives (jobs, storage, API calls)

## Status Update — 2026-02-23

- Added competitive dataset analysis and launch kit assets (`stallion/data`, `stallion/launch-kit`).
- Completed ACE→SADDEC comparison and profile-based validation workflow in `workspace/inbox_drive`.
- Transformer pipeline validated end-to-end (dummy enrichment test pass); production run pending broker-provided real values.
- Next execution: replace dummy values, run final transform, validate, and package submission-ready XML.
