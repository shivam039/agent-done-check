# PRD: Agent Done Check 0.29.0 — Required HTTP response headers

**Status:** Complete  
**Target:** 0.29.0

## Summary

Let HTTP checks require named response headers to exist, without needing to configure their values.

## Acceptance criteria

- Add HTTP-only `requiredResponseHeaders`, 1–20 valid unique header names, case-insensitive for uniqueness and matching.
- Evaluate only after exact target commit binding; missing required headers fail and cancel before body consumption.
- Report normalized names with booleans; absent assertion is null. Never record values.
- May combine with exact `responseHeaders`; overlapping names are allowed and both assertions must pass.
- Update schemas, docs, example, tests, and adversarially review sequencing/privacy/bounds.

## Tracking issues

- [#92 Implementation](https://github.com/shivam039/agent-done-check/issues/92)
- [#93 Documentation](https://github.com/shivam039/agent-done-check/issues/93)
- [#94 Tests](https://github.com/shivam039/agent-done-check/issues/94)
- [#95 Adversarial review](https://github.com/shivam039/agent-done-check/issues/95)

## Adversarial review

- Confirmed unbound responses leave `responseHeadersPresent` null and cannot expose header state before commit binding.
- Confirmed an empty-valued header counts as present (`Headers.get` returns an empty string, distinct from null).
- Confirmed missing required headers cancel before body reads; a streaming fixture records null body byte count.
- Confirmed required and exact assertions can overlap; presence and exact-value checks both pass.
- Confirmed case-folded duplicate names, invalid token names, 21 names, and non-HTTP use are rejected.
- Confirmed reports expose only normalized names and booleans, never observed values.
- Consolidated the report schema property into one nullable object definition with lowercase key validation.

## Rollout

Merge 0.29.0 by GitHub PR after CI passes. No package publication or release tag.
