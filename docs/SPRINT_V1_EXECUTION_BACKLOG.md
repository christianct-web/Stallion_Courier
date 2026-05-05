# Stallion Sprint v1 Backlog

## Sprint Goal
Ship deterministic Review-to-Export cockpit with state gates and explain-fix remediation.

## Backend (22atlas + 31circuit)
1. Implement state machine (`Draft` -> `Archived`) with transition guards.
2. Add validation severity model + blocker gate API.
3. Add readiness summary endpoint (completion %, blockers, warnings, profile).
4. Add validation snapshot hash + stale-state detection.
5. Add audit event log service for state/field/export events.

## Frontend (31circuit + 44forge)
1. Replace icon-only toolbar with labeled action bar.
2. Build Submission Readiness panel.
3. Build Explain-Fix drawer tied to field paths.
4. Add export button hard-gate messaging.
5. Improve table hierarchy/readability for item rows + totals.

## QA / Compliance (23pulse + 44forge)
1. Validate general profile blockers.
2. Validate vehicle profile blockers (`Chassis_number`, `Engine_number`).
3. Test stale validation behavior after field edits.
4. Verify export disabled with blockers > 0.
5. Verify audit timeline completeness.

## Acceptance Criteria
- Export impossible with blockers.
- 100% mandatory fields required for Ready to Export.
- Explain-Fix maps each blocker to direct correction path.
- Validation state freshness visible at all times.
- Audit timeline captures all critical actions.
