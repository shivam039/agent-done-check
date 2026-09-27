# PRD: Agent Done Check 0.21.0 — HTTP response body digest assertions

**Status:** Complete  
**Target:** 0.21.0

## Summary

Allow commit-bound HTTP checks to verify raw response bytes with SHA-256, including binary and non-UTF-8 bodies.

## Goals and acceptance criteria

- Add HTTP-only `bodySha256` with a required lowercase 64-character SHA-256 digest.
- Compare the digest of bounded raw response bytes after exact commit binding and response-header assertions.
- Preserve the 1 MiB body cap; oversized, timed out, or unbound responses remain unverified.
- Combine digest assertion with expected status and optional UTF-8 `bodyContains`; invalid UTF-8 remains unverified only when text assertion is configured.
- Keep reports free of configured expected digest and response content; existing observed `bodySha256` and a `bodySha256Matched` boolean may be reported.
- Update schema, documentation, HTTP example, tests, and adversarially review byte hashing, binding, size limits, and privacy.

## Tracking issues

- [#53 Implementation](https://github.com/shivam039/agent-done-check/issues/53)
- [#54 Documentation](https://github.com/shivam039/agent-done-check/issues/54)
- [#55 Tests](https://github.com/shivam039/agent-done-check/issues/55)
- [#56 Adversarial review](https://github.com/shivam039/agent-done-check/issues/56)

## Rollout

Push 0.21.0 to `main`. Do not publish the package or create a release tag.
