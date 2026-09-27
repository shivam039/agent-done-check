# PRD: Agent Done Check 0.27.0 — Shell-free argv commands

**Status:** Complete  
**Target:** 0.27.0

## Summary

Allow command checks to pass an executable and argument list directly to the operating system without shell parsing.

## Acceptance criteria

- Preserve string `command` behavior; additionally accept argv array `[program, ...args]` for command checks.
- Execute argv arrays with shell disabled and preserve each argument boundary exactly.
- Validate non-empty executable, string arguments, no NUL, at most 256 items and at most 65,536 total characters.
- Keep existing environment allowlisting, timeouts, output limits, working directories, expected exit codes, and worktree mutation checks.
- Report a safely redacted JSON representation; maintain shell command reports unchanged.
- Adversarially review injection, validation bounds, process launch, redaction, and Windows compatibility.

## Tracking issues

- [#82 Implementation](https://github.com/shivam039/agent-done-check/issues/82)
- [#83 Documentation](https://github.com/shivam039/agent-done-check/issues/83)
- [#84 Tests](https://github.com/shivam039/agent-done-check/issues/84)
- [#85 Adversarial review](https://github.com/shivam039/agent-done-check/issues/85)

## Rollout

Merge 0.27.0 through a GitHub PR after CI passes. No npm publication or release tag.
