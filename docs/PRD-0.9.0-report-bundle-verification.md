# PRD: Agent Done Check 0.9.0 — Report bundle verification

**Status:** Approved for implementation  
**Target:** 0.9.0

## Summary

Add an offline CLI mode that checks an existing evidence manifest and all listed artifacts for path safety, byte-count integrity, SHA-256 integrity, and report identity consistency. It does not rerun checks.

## Goals and acceptance criteria

- `--verify-bundle [--manifest <file>]` defaults to `.agent-done-check/manifest.json` and works outside a Git repository.
- Read and validate manifest v1, including required identity and artifact fields; reject duplicate artifact paths.
- Resolve artifact paths relative to the manifest directory. Reject absolute paths, lexical traversal outside that directory, and symlinks whose resolved targets escape it.
- Verify each listed artifact's byte count and SHA-256 using streaming reads. Require exactly one JSON report artifact and verify its run ID and commit match the manifest.
- Emit one JSON result with `valid`, `manifestPath`, `runId`, `commit`, `artifactsChecked`, and `errors` (empty when valid).
- Exit 0 when valid, 1 when artifacts are missing or inconsistent, and 2 when the manifest cannot be read or is structurally invalid.
- Never execute configured checks or alter the bundle.

## Integrity limits

A matching manifest detects accidental corruption and establishes internal consistency among the listed files. The manifest is unsigned, so it does not prove who created the bundle or prevent an attacker from replacing both files and hashes.

## Tracking issues

- [#13 Bundle verifier](https://github.com/shivam039/agent-done-check/issues/13)
- [#14 Documentation and integrity limits](https://github.com/shivam039/agent-done-check/issues/14)
- [#15 Verification tests](https://github.com/shivam039/agent-done-check/issues/15)

## Rollout

Prepare 0.9.0 for `main`. Do not publish the npm package or create a release tag.
