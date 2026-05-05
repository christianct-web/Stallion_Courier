# ASYCUDA XML Validation Playbook

## Objective
Produce clean, ASYCUDA-ready XML with clear, actionable error feedback.

## Input requirements
- Structured shipment/invoice data
- Required broker metadata
- Correct HS and duty-relevant fields

## Validation pipeline
1. Structural checks (required fields, datatypes)
2. Mapping checks (internal field → ASYCUDA field)
3. Schema checks (XSD validation)
4. Rule checks (business logic + consistency)
5. Error grouping and remediation hints

## Error handling standard
- Error code
- Human-readable message
- Source field reference
- Suggested fix
- Severity (warning/blocker)

## Exit criteria
- XML passes XSD validation
- No blocker-level errors
- Audit log records validation pass timestamp
