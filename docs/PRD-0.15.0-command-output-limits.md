# PRD: Agent Done Check 0.15.0 — Command output capture limits

**Status:** Approved for implementation  
**Target:** 0.15.0

## Summary

Allow a command check to retain more or less captured output than the default, with a strict per-stream memory and report bound.

## Goals and acceptance criteria

- Add optional command-only `maxOutputBytes`, an integer from 1024 through 1048576.
- Keep the default at 24000 bytes per stream and retain the final bytes as today.
- Pass the configured bound to stdout and stderr capture independently; report the effective limit and existing per-stream truncation flags.
- Preserve output substring assertion semantics: evaluate against only captured bytes, and absent assertions on truncated streams remain unverified.
- Reject the setting on non-command checks. Update schema/docs and test default, custom, and invalid bounds.
- Keep report schema and dependencies unchanged.

## Tracking issues

- [#31 Output limit implementation](https://github.com/shivam039/agent-done-check/issues/31)
- [#32 Documentation](https://github.com/shivam039/agent-done-check/issues/32)
- [#33 Tests](https://github.com/shivam039/agent-done-check/issues/33)

## Rollout

Push 0.15.0 to `main`. Do not publish the package or create a release tag.
