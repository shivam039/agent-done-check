# PRD: Agent Done Check 0.20.0 — JSON Pointer file assertions

**Status:** Complete  
**Target:** 0.20.0

## Summary

Let commit-bound file checks compare a JSON value at a pointer in the committed file.

## Goals and acceptance criteria

- Add file-only `jsonPointerEquals`, requiring an RFC 6901 `pointer` (empty string selects the root) and any JSON `expected` value.
- Support escaped tokens (`~0`, `~1`), object keys, array indices, null, and structured values; compare object members independent of key order.
- Reject invalid pointer syntax or pointers longer than 4096 characters during config validation. Missing pointers and unequal values fail. Malformed JSON fails; invalid UTF-8 and oversized files remain unverified.
- Never include expected values or file contents in reports; retain existing file byte count, hash, path, and match evidence.
- Update config schema/docs and test root, nested, escaped, array, null, object, missing, malformed, invalid, and privacy cases.
- Adversarially review pointer decoding, prototype keys, array index grammar, JSON equality, and bounds.

## Tracking issues

- [#49 Implementation](https://github.com/shivam039/agent-done-check/issues/49)
- [#50 Documentation](https://github.com/shivam039/agent-done-check/issues/50)
- [#51 Tests](https://github.com/shivam039/agent-done-check/issues/51)
- [#52 Adversarial review](https://github.com/shivam039/agent-done-check/issues/52)

## Rollout

Push 0.20.0 to `main`. Do not publish the package or create a release tag.
