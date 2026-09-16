# MetricMotive Intelligent Contract

Python Intelligent Contract for GenLayer.

## Methods

### Write

- `create_guard(motive, metric, guardrails_json)`
- `update_draft(guard_id, motive, metric, guardrails_json)`
- `arm_guard(guard_id)`
- `submit_evidence(guard_id, evidence_json)`
- `evaluate_guard(guard_id)`
- `create_version(parent_id, motive, metric, guardrails_json)`

### Read

- `get_contract_info`
- `get_guard_count`
- `get_guard_summary`
- `get_guard_status`
- `get_guard_definition`
- `get_guard_lineage`
- `get_guard_evidence`
- `get_guard_findings`
- `get_guard_verdict`
- `get_guard`
- `get_guards_by_owner`

## Verdict mapping

If evidence_sufficient is false → INSUFFICIENT_EVIDENCE

Else if metric_satisfied and (material_violation or circumvention_detected or not goal_advanced) → METRIC_GAMING

Else if goal_advanced and metric_satisfied and not material_violation and not circumvention_detected → FAITHFUL_SUCCESS

Else → PARTIAL_ALIGNMENT

## Tests

```bash
python tests/test_verdict_mapping.py
```
