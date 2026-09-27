# PRD: Agent Done Check 0.12.0 — Expected command exit codes

**Status:** Approved for implementation  
**Target:** 0.12.0

## Summary

Allow a command check to pass on a configured exit code other than zero, supporting commands whose successful condition is represented by a conventional nonzero status.

## Goals and acceptance criteria

- Command checks accept optional integer `expectedExitCode` from 0 through 255; its default is 0.
- A command passes only when its completed process exit code equals the configured expected code.
- Any other completed exit code is `failed`; timeouts remain `unverified`.
- Record the expected exit code in the check result so reports show what was evaluated.
- Reject this option for Playwright, file, and HTTP checks rather than silently ignoring it.
- Existing adapter semantics and report schema version remain unchanged; report schema v4 permits additive check properties.
- No runtime dependencies are added.

## Non-goals

- Accepting multiple codes, interpreting shell pipeline status, or changing signal/timeout behavior.
- npm publication or release tagging.

## Tracking issues

- [#22 Command exit code behavior](https://github.com/shivam039/agent-done-check/issues/22)
- [#23 Documentation and release bookkeeping](https://github.com/shivam039/agent-done-check/issues/23)
- [#24 Exit code tests](https://github.com/shivam039/agent-done-check/issues/24)

## Rollout

Prepare 0.12.0 for `main`. Do not publish the package or create a release tag.
