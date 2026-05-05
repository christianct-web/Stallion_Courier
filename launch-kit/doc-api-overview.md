# Stallion API Overview & Authentication

## What this API does
Stallion connects broker workflows from data intake to validation and submission readiness.

## Core workflow
1. Create job
2. Upload source data
3. Validate fields + schema
4. Generate ASYCUDA-ready outputs
5. Return errors/warnings with fix guidance

## Authentication
- API key in Authorization header
- Environment isolation: test/live keys
- Key rotation supported

## Base endpoints (example structure)
- POST /v1/jobs
- POST /v1/jobs/{id}/documents
- POST /v1/jobs/{id}/validate
- GET /v1/jobs/{id}/results

## Error model
- 400 input errors
- 401/403 auth errors
- 422 validation errors (field-level)
- 500 internal processing errors

## Integration best practices
- Idempotency keys on job creation
- Retry with exponential backoff for 5xx
- Persist job IDs in client systems
- Log validation events for audit trail
