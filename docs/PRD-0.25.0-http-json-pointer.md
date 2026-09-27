# PRD: Agent Done Check 0.25.0 — HTTP JSON Pointer assertions

**Status:** Complete  
**Target:** 0.25.0

## Summary

Let commit-bound HTTP checks compare a JSON value in a response body using RFC 6901 JSON Pointer.

## Acceptance criteria

- Add HTTP-only `bodyJsonPointerEquals` with required valid `pointer` and any JSON `expected` value.
- Reuse file pointer decoding and JSON typed equality rules.
- Parse only after exact commit binding and bounded body read. Missing pointer or unequal value fails; malformed JSON fails; invalid UTF-8 and oversized bodies remain unverified.
- Record only nullable match status; never record configured pointer, expected value, or response contents.
- Cover JSON types/order/escapes, mismatch, binding, malformed, invalid UTF-8, bounds, schema, and outputs.
- Adversarially review sequencing, parser behavior, prototype keys, bounds, and all report formats.

## Tracking issues

- [#72 Implementation](https://github.com/shivam039/agent-done-check/issues/72)
- [#73 Documentation](https://github.com/shivam039/agent-done-check/issues/73)
- [#74 Tests](https://github.com/shivam039/agent-done-check/issues/74)
- [#75 Adversarial review](https://github.com/shivam039/agent-done-check/issues/75)

## Rollout

Merge 0.25.0 to `main` through a PR after CI passes. No npm publication or release tag.
