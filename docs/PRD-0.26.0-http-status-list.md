# PRD: Agent Done Check 0.26.0 — Multiple acceptable HTTP statuses

**Status:** Complete  
**Target:** 0.26.0

## Summary

Allow a commit-bound HTTP check to accept a bounded list of exact response status codes.

## Acceptance criteria

- Add HTTP-only `expectedStatuses`: 1–20 unique integer statuses in the range 100–599.
- It cannot be combined with legacy `expectedStatus`; omission preserves explicit scalar or default 200.
- A response passes its status assertion only when the status appears in the list.
- Report effective `expectedStatuses`, with the legacy `expectedStatus` evidence field set to the first accepted code for list configurations.
- Update config/report schemas, docs, example, tests; preserve older config and report forms.
- Adversarially review boundaries, uniqueness, mutual exclusion, outcome, and report compatibility.

## Tracking issues

- [#77 Implementation](https://github.com/shivam039/agent-done-check/issues/77)
- [#78 Documentation](https://github.com/shivam039/agent-done-check/issues/78)
- [#79 Tests](https://github.com/shivam039/agent-done-check/issues/79)
- [#80 Adversarial review](https://github.com/shivam039/agent-done-check/issues/80)

## Rollout

Merge 0.26.0 to `main` by PR after CI passes. No npm publication or release tag.
