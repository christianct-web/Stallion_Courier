# Data Contracts (Example Patterns)

## JSON contract (example)
```json
{
  "jobId": "JOB-12345",
  "importer": {"name": "Acme Imports Ltd"},
  "lines": [
    {"sku": "ABC-1", "description": "Item", "hsCode": "1234.56", "value": 1200.50}
  ]
}
```

## XML output goals
- Deterministic field mapping
- Schema-compliant output
- Clear line-to-line traceability

## Field mapping principles
- One source of truth for each field
- Explicit transform rules
- Versioned mapping tables
- Backward compatibility notes

## Change management
- Contract versions must be tagged
- Breaking changes require migration notes
- Validation suite runs before release
