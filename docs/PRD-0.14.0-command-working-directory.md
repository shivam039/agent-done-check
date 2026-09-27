# PRD: Agent Done Check 0.14.0 — Command working directories

**Status:** Approved for implementation  
**Target:** 0.14.0

## Summary

Allow command checks to run from a committed subdirectory of their isolated worktree.

## Goals and acceptance criteria

- Add optional `workingDirectory` to command checks. Omission keeps the current worktree-root behavior.
- Require a normalized relative path; reject absolute paths, traversal, empty segments, and unsupported check types during config validation.
- At run time, require the directory to exist inside the checked-out commit and reject symlink escapes. A missing or unsafe target is unverified.
- Record only the configured relative directory in JSON evidence; avoid host absolute paths.
- Update the v1 config schema and README. Keep report schema and dependencies unchanged.
- Test root defaults, nested directories, invalid paths, missing/non-directory paths, and symlink escapes.

## Tracking issues

- [#28 Command working directory support](https://github.com/shivam039/agent-done-check/issues/28)
- [#29 Documentation](https://github.com/shivam039/agent-done-check/issues/29)
- [#30 Tests](https://github.com/shivam039/agent-done-check/issues/30)

## Rollout

Push 0.14.0 to `main`. Do not publish the package or create a release tag.
