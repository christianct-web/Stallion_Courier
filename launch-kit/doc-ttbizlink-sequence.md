# TTBizLink Integration Sequence (Reference)

## Purpose
Define a deterministic sequence from broker data intake to submission-ready package.

## Sequence
1. Intake job created in Stallion
2. Source documents/data normalized
3. HS classification checks applied
4. ASYCUDA mapping and XML generation
5. Validation pass with error remediation loop
6. Final package handoff for submission workflow

## Integration checkpoints
- Checkpoint A: intake complete
- Checkpoint B: mapping complete
- Checkpoint C: validation passed
- Checkpoint D: package ready

## Operational controls
- Unique transaction IDs
- Status webhooks/events
- Retry/reprocess without duplication
- Timestamped audit trail
