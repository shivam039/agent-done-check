# PRD: Agent Done Check 0.22.0 — HTTP report schema alignment

**Status:** Complete  
**Target:** 0.22.0

## Summary

Bring report schema v4 into alignment with HTTP evidence already emitted by the runner, including header assertion outcomes and body digest assertion outcomes.

## Goals and acceptance criteria

- Define `responseHeadersMatched` as null when no header assertion ran, otherwise a map of normalized names to booleans.
- Define `bodySha256Matched` as null when no digest assertion ran, otherwise boolean.
- Document observed digest versus configured digest privacy and nullable/unavailable behavior.
- Test passed, failed, unbound, and unavailable HTTP report forms against v4 schema.
- Confirm older v4 report examples without the new optional properties still validate.
- Adversarially review requiredness, nullability, backwards compatibility, and expected-value leakage.

## Tracking issues

- [#57 Implementation](https://github.com/shivam039/agent-done-check/issues/57)
- [#58 Documentation](https://github.com/shivam039/agent-done-check/issues/58)
- [#59 Tests](https://github.com/shivam039/agent-done-check/issues/59)
- [#60 Adversarial review](https://github.com/shivam039/agent-done-check/issues/60)

## Rollout

Merge 0.22.0 to `main` through a GitHub pull request after CI passes. Do not publish the package or create a release tag.
