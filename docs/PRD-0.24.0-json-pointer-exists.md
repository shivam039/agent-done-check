# PRD: Agent Done Check 0.24.0 — JSON Pointer existence assertions

**Status:** Complete  
**Target:** 0.24.0

## Summary

Let committed JSON file checks assert that a JSON Pointer resolves, without requiring a particular value.

## Acceptance criteria

- Add file-only `jsonPointerExists`, requiring a valid bounded RFC 6901 `pointer` and rejecting `expected`.
- Any resolved JSON value passes, including `null`, `false`, zero, empty string, arrays, and objects.
- Missing pointer fails; malformed JSON fails; invalid UTF-8 and oversized files remain unverified.
- Keep configured pointer and file contents out of reports.
- Cover pointer escaping, arrays, validation/schema, missing and encoding cases.
- Adversarially review missing-versus-null handling, bounds, schema/runtime consistency, and privacy.

## Tracking issues

- [#67 Implementation](https://github.com/shivam039/agent-done-check/issues/67)
- [#68 Documentation](https://github.com/shivam039/agent-done-check/issues/68)
- [#69 Tests](https://github.com/shivam039/agent-done-check/issues/69)
- [#70 Adversarial review](https://github.com/shivam039/agent-done-check/issues/70)

## Rollout

Merge 0.24.0 to `main` through a PR after CI passes. No package publication or release tag.
