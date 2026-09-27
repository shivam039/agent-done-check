# Agent Done Check roadmap

This document separates capabilities present in the current code from work that is still planned. A roadmap item is not a claim that the feature already exists.

## Current release: 0.3.0

Agent Done Check is a Node.js CLI that evaluates a versioned JSON contract against a selected Git commit.

Implemented:

- JSON validation for criteria, checks, timeouts, environment values, and Playwright scenarios.
- Fresh detached worktree per check, pinned to the resolved commit.
- Shell command checks and Playwright browser checks.
- `passed`, `failed`, and `unverified` result states, with CI-friendly exit codes.
- Bounded check duration and captured output; source changes and revision movement prevent a check from passing.
- JSON and Markdown reports, captured evidence, and a SHA-256 artifact manifest.
- Browser screenshots, browser diagnostics, and an exact-commit marker requirement for passing browser checks.
- Example configuration and GitHub Actions workflow.

Not implemented: OS-level sandboxing, a dedicated GitHub Action, API-check adapters, automatic package publishing, and formal schema compatibility guarantees. The checks run with the host user's privileges; do not run untrusted repository code with this tool.

## Next: safer adoption

- Add explicit documentation and checks for what environment variables are passed to verification commands.
- Provide a reviewed GitHub Action or reusable workflow that can run with narrowly scoped permissions.
- Improve evidence retention and redaction controls while making clear that output redaction cannot guarantee secret removal.
- Add test coverage for supported operating systems and document platform-specific process termination behavior.

## Later: stable integration contract

- Publish a formal JSON Schema for configuration and reports.
- Define compatibility guarantees before a 1.0 release.
- Add additional check adapters only when their revision binding and evidence semantics are clear.
- Evaluate real sandbox backends before supporting checks from untrusted pull requests.

## Project principles

- A completion claim is not evidence; only configured checks determine results.
- A check proves only the behavior it exercises.
- Missing, failed, timed-out, or unbound evidence cannot count as a pass.
- A Git worktree isolates files and revision state, not process privileges.
- Never claim that a passing report establishes production safety or full correctness.
