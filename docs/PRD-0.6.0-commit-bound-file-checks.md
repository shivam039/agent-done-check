# PRD: Agent Done Check 0.6.0 — Commit-bound file checks

**Status:** Approved for implementation  
**Target:** 0.6.0  
**Owner:** Agent Done Check maintainers

## Summary

Add a narrow `file` check adapter for assertions about text files in the exact commit under verification. The adapter runs against the fresh detached worktree created for that check, does not execute repository commands, rejects paths that resolve outside the worktree, and emits concise hash-based evidence. Update the versioned config/report schemas and explain the adapter's limits.

## Problem

Agent Done Check currently supports shell commands and Playwright scenarios. Those are useful but execute code and can be overly broad for simple assertions such as checking a committed setting, generated marker, or documentation string. The roadmap calls for adapters only when their revision binding and evidence semantics are clear.

## Goals

- Support a `type: "file"` check that evaluates one file in the exact detached worktree for the requested commit.
- Support four explicit assertions: file exists, exact UTF-8 text equality, UTF-8 substring containment, and SHA-256 equality.
- Prevent path traversal and symlink resolution outside the verification worktree.
- Bound file size and produce enough evidence to explain the result without copying file contents into the report.
- Keep the CLI dependency-free at runtime.
- Publish the adapter in config schema v1 and version the report schema for the new result shape.

## Non-goals

- Running arbitrary scripts, shell commands, regular expressions, or JSONPath from the file adapter.
- Treating file assertions as proof of runtime behavior or application correctness.
- Supporting binary file comparisons or files larger than 1 MiB.
- Changing command or Playwright semantics.
- Enabling untrusted verification configs, adding an OS sandbox, or publishing the npm package.

## User stories

1. As a project maintainer, I can verify a committed configuration or marker file without running project code.
2. As an integration author, I can bind an assertion to the exact requested Git commit and validate its config/result with published schemas.
3. As a report consumer, I can see the relative file path, assertion kind, actual file hash and byte size, and whether the assertion matched without receiving file contents.

## Requirements and acceptance criteria

### Config contract

- A file check has `id`, `type: "file"`, `criteria`, relative `path`, and `assertion`.
- Supported `assertion` values are `exists`, `equals`, `contains`, and `sha256`.
- `equals` and `contains` require a string `expected`; `sha256` requires a 64-character lowercase hexadecimal digest in `expected`; `exists` does not accept `expected`.
- Reject absolute paths, empty paths, `..` traversal, NUL bytes, directories, unreadable files, and paths whose resolved target escapes the worktree.
- All existing targets must be regular files no larger than 1 MiB. Text assertions decode UTF-8 strictly. The adapter hashes the bounded bytes for report evidence but never copies their contents into output.
- The adapter uses the already-created detached worktree for the requested full commit. It must not run `setupCommand`, shell commands, or repository code.

### Result and evidence contract

- Each file check result includes a `file` object with relative `path`, `assertion`, `exists`, `bytes`, `sha256`, and `matched` fields; `expected` is not echoed to avoid copying potentially sensitive config values into output.
- A missing file yields `failed` for `exists`, and `failed` for the other assertions with `exists: false` and `matched: false`.
- Unsafe paths, non-regular files, unreadable files, invalid UTF-8 for text assertions, and files above the size limit yield `unverified` with a concise error and no file contents.
- Bump report `schemaVersion` to 3 and add the new result shape to its schema. Keep config `version` at 1 and extend config schema v1 additively. Manifest shape and version remain unchanged.
- File evidence is metadata and a hash; no source content is copied into the report or manifest.

### Documentation and validation

- Add a complete file-check example and explain that it verifies repository state, not runtime behavior.
- Update README, roadmap, compatibility policy, and published schemas to reflect the adapter and report schema version 3.
- Test all four assertions, missing paths, traversal and symlink escapes, size and UTF-8 handling, commit binding, and schema conformance.
- Run tests in the existing Linux/macOS/Windows and Node 22/24 matrix.

## Risks and limits

This adapter avoids executing project code but is not a sandbox for command or browser checks. A passing file assertion proves only that the requested property held for the file read from the checked-out commit. Symlink and path containment checks are mandatory. SHA-256 is integrity metadata, not a claim that the file is safe or meaningful.

## Rollout

Merge implementation on `main` as 0.6.0 preparation. Do not publish the package or create a release tag as part of this PRD. The npm package remains unpublished until the release process is separately confirmed.

## Tracking issues

- [#4 Implement the commit-bound file check adapter](https://github.com/shivam039/agent-done-check/issues/4)
- [#5 Update schemas and document the 0.6 adapter contract](https://github.com/shivam039/agent-done-check/issues/5)
- [#6 Add file adapter and schema conformance coverage](https://github.com/shivam039/agent-done-check/issues/6)
