# Stallion Workflow Semantics v1

## Objective
Deterministic declaration workflow with explicit state gates and fail-fast validation.

## Canonical States
1. **Draft** — record created, no extraction yet
2. **Extracted** — invoice fields/lines extracted
3. **Mapped** — ACE-origin fields mapped to SADDEC structure
4. **Validated** — rules executed, no blockers pending evaluation snapshot
5. **Exception** — one or more blocker errors present
6. **Ready to Export** — blockers = 0, required fields complete
7. **Exported** — XML bundle generated and checksums recorded
8. **Submitted** — external submission completed (manually or integrated)
9. **Archived** — closed record, immutable except admin annotation

## State Transition Rules
- Draft -> Extracted: requires source file + successful parse
- Extracted -> Mapped: requires mapping profile selected (`general` or `vehicle`)
- Mapped -> Validated: validation run completed
- Validated -> Exception: any blocker severity error exists
- Validated -> Ready to Export: blocker count == 0 and required-completion == 100%
- Ready to Export -> Exported: XML generation + profile schema pass
- Exported -> Submitted: user/manual confirmation or integration callback
- Submitted -> Archived: supervisor close-out

## Severity Model
- **Blocker**: prevents export
- **Warning**: export allowed with explicit acknowledgment
- **Info**: advisory only

## Required Readiness Metrics
- Required fields completion %
- Blocker count
- Warning count
- Profile (`general` / `vehicle`)
- Last validation timestamp
- Last editor

## Explain-Fix Contract
Every Blocker must include:
- `field_path`
- `error_code`
- `reason_human`
- `fix_action`
- `owner_role` (Operator/Reviewer)

## Export Gate Policy
Export button enabled only when:
- state == Ready to Export
- blocker_count == 0
- active validation snapshot is current (no stale edits)

## Audit Requirements
Persist event timeline entries for:
- state changes
- field edits for mandatory fields
- validation runs
- export generation
- submission/close-out events
