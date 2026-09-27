# PRD: Agent Done Check 0.19.0 — HTTP response header assertions

**Status:** Complete  
**Target:** 0.19.0

## Summary

Let commit-bound HTTP checks assert exact values for a small set of response headers.

## Goals and acceptance criteria

- Add HTTP-only `responseHeaders`, an object with at most 20 valid header-name/string-value pairs; each expected value is at most 4096 characters.
- Compare header names case-insensitively and values exactly after Fetch normalization. Reject duplicate names ignoring case.
- Evaluate assertions only after the response proves the requested commit. A missing or mismatched expected response header fails a bound check; an unbound response remains unverified.
- Report normalized header names and match booleans only, never expected or observed values.
- Preserve existing HTTP status/body checks, document semantics, and test input bounds and value privacy.
- Adversarially review commit binding, header normalization, privacy, and interactions with bounded body reads.

## Tracking issues

- [#45 Implementation](https://github.com/shivam039/agent-done-check/issues/45)
- [#46 Documentation](https://github.com/shivam039/agent-done-check/issues/46)
- [#47 Tests](https://github.com/shivam039/agent-done-check/issues/47)
- [#48 Adversarial review](https://github.com/shivam039/agent-done-check/issues/48)

## Rollout

Push 0.19.0 to `main`. Do not publish the package or create a release tag.
