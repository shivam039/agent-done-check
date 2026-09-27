# PRD: Agent Done Check 0.28.0 — Multiple expected command exit codes

**Status:** Complete  
**Target:** 0.28.0

## Summary

Let a command check pass on one of several explicitly accepted completed exit codes.

## Acceptance criteria

- Add command-only `expectedExitCodes`, 1–32 unique integer codes in range 0–255.
- Reject simultaneous `expectedExitCode` and `expectedExitCodes`.
- Preserve legacy scalar and default code 0 behavior.
- A timed-out process remains unverified regardless of accepted codes.
- Report effective list and preserve legacy `expectedExitCode` as its first value.
- Update schema/docs/roadmap and test values, validation, timeout, report, and CI.
- Adversarially review signals/timeouts, bounds, type restrictions, and integration outputs.

## Tracking issues

- [#87 Implementation](https://github.com/shivam039/agent-done-check/issues/87)
- [#88 Documentation](https://github.com/shivam039/agent-done-check/issues/88)
- [#89 Tests](https://github.com/shivam039/agent-done-check/issues/89)
- [#90 Adversarial review](https://github.com/shivam039/agent-done-check/issues/90)

## Rollout

Merge 0.28.0 through a GitHub PR after CI passes. No npm publication or release tag.
