# PRD: Agent Done Check 0.8.0 — Offline config validation

**Status:** Approved for implementation  
**Target:** 0.8.0

## Summary

Add `--validate` to inspect a configuration before running any configured command, browser, file, or HTTP check. It works outside a Git repository and emits a machine-readable JSON result with stable top-level fields and a validity exit code.

## Problem

Today, users discover malformed or invalid configuration only when starting a full audit. That also requires the current directory to be a Git repository, even when they only want to review the config.

## Goals and acceptance criteria

- `agent-done-check --validate [--config <file>]` reads and validates the same config contract used by a normal run.
- Validation does not resolve Git state, create worktrees, access configured HTTP URLs, start browsers, or execute commands.
- Output is one JSON object on stdout. Valid results contain `valid: true`, a config path, criterion count, and check count. Invalid results contain `valid: false` and an errors array.
- Exit status is 0 for valid configuration and 2 for invalid, unreadable, or malformed configuration.
- The default config path remains `agent-done-check.json`; explicit paths are resolved from the current working directory.
- Existing audit invocation and its exit behavior do not change.

## Non-goals

- Running checks in dry-run mode, fetching remote schemas, or rewriting/normalizing config files.
- npm publication or release tagging.

## Tracking issues

- [#10 Offline validation mode](https://github.com/shivam039/agent-done-check/issues/10)
- [#11 Documentation and roadmap](https://github.com/shivam039/agent-done-check/issues/11)
- [#12 Validation mode tests](https://github.com/shivam039/agent-done-check/issues/12)

## Rollout

Prepare version 0.8.0 and push the implementation to `main`. Do not publish the package or create a release tag.
