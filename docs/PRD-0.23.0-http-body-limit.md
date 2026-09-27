# PRD: Agent Done Check 0.23.0 — Per-check HTTP body limits

**Status:** Complete  
**Target:** 0.23.0

## Summary

Let each HTTP check lower the maximum response body size it will consume, while preserving the global 1 MiB hard ceiling.

## Acceptance criteria

- Add HTTP-only `maxBodyBytes`, integer range 1–1,048,576; default remains 1,048,576.
- Enforce the effective byte limit while streaming, cancel promptly when exceeded without retaining the over-limit chunk, and keep oversized responses unverified.
- Include effective limit in HTTP report and schema.
- Test boundary, over-limit chunk, invalid values, defaults, and binding-before-body semantics.
- Adversarially review byte accounting, stream cancellation, content-length handling, and hard ceiling.

## Tracking issues

- [#62 Implementation](https://github.com/shivam039/agent-done-check/issues/62)
- [#63 Documentation](https://github.com/shivam039/agent-done-check/issues/63)
- [#64 Tests](https://github.com/shivam039/agent-done-check/issues/64)
- [#65 Adversarial review](https://github.com/shivam039/agent-done-check/issues/65)

## Rollout

Merge 0.23.0 to `main` by PR after CI passes. No npm publish or release tag.
