# Agent Done Check roadmap

## Completed: 0.4.0 — Safer adoption

Implemented:

- By default, checks inherit only platform basics required to run tools. Additional host variables must be listed in `inheritEnv`.
- `redactEnv` masks named host/config values in captured command output and browser diagnostics. Common bearer, GitHub, OpenAI-style, and JWT token patterns are masked too.
- The GitHub Actions examples use read-only repository permissions and disable checkout credential persistence; a reusable workflow is available for trusted caller repositories.
- GitHub Actions dependencies are pinned to verified commits on Node.js 24-compatible release lines.
- Project CI is configured to run tests on Linux, macOS, and Windows with Node.js 22 and 24.
- Known GitHub Actions credential/control variables and npm publish tokens are rejected from `inheritEnv`.
- Documentation explains the limits of masking, shell execution, and worktree isolation.

Redaction is best-effort. It cannot reliably identify transformed secrets or data in screenshots. Checks remain unsandboxed and run with the host user's privileges; do not run untrusted verification configs or grant untrusted code access to sensitive variables.

## Completed: 0.5.0 — Stable integration contract

PRD: [`docs/PRD-0.5.0-stable-integration-contract.md`](./docs/PRD-0.5.0-stable-integration-contract.md)

- Publish JSON Schemas for config v1, report schema v2, and manifest schema v1.
- Document pre-1.0 compatibility, deprecation, and migration policy.
- Validate examples and generated report/manifest output against the schemas in tests.

## Completed: 0.6.0 — Commit-bound file checks

PRD: [`docs/PRD-0.6.0-commit-bound-file-checks.md`](./docs/PRD-0.6.0-commit-bound-file-checks.md)

- Add static file assertions for existence, exact UTF-8 text, contained text, or SHA-256.
- Bind assertions to the requested commit's detached worktree and emit bounded hash metadata.
- Keep report schema v2 available and version the current report shape as schema v3.

## Completed: 0.7.0 — Commit-bound HTTP checks

PRD: [`docs/PRD-0.7.0-commit-bound-http-checks.md`](./docs/PRD-0.7.0-commit-bound-http-checks.md)

- Add read-only GET checks whose response must expose the exact requested commit SHA.
- Bound response bodies and record only sanitized status and hash metadata.
- Preserve report schemas v2 and v3 and introduce report schema v4.

## Completed: 0.8.0 — Offline config validation

PRD: [`docs/PRD-0.8.0-offline-config-validation.md`](./docs/PRD-0.8.0-offline-config-validation.md)

- Add a JSON-output validation mode that checks configs without running checks or requiring Git.

## Completed: 0.9.0 — Report bundle verification

PRD: [`docs/PRD-0.9.0-report-bundle-verification.md`](./docs/PRD-0.9.0-report-bundle-verification.md)

- Verify manifest paths, byte counts, hashes, and report identity without rerunning checks.

## Completed: 0.10.0 — SARIF export

PRD: [`docs/PRD-0.10.0-sarif-export.md`](./docs/PRD-0.10.0-sarif-export.md)

- Export failed and unverified checks as SARIF 2.1.0 and include it in the bundle manifest.

## Completed: 0.11.0 — JUnit XML export

PRD: [`docs/PRD-0.11.0-junit-export.md`](./docs/PRD-0.11.0-junit-export.md)

- Export one JUnit test case per configured check and include the report in the evidence manifest.

## Completed: 0.12.0 — Expected command exit codes

PRD: [`docs/PRD-0.12.0-expected-exit-code.md`](./docs/PRD-0.12.0-expected-exit-code.md)

- Allow command checks to pass on a selected process exit code while preserving timeout semantics.

## Completed: 0.13.0 — Command output assertions

PRD: [`docs/PRD-0.13.0-command-output-assertions.md`](./docs/PRD-0.13.0-command-output-assertions.md)

- Add safe stdout/stderr substring assertions with explicit bounded-capture semantics.

## Completed: 0.14.0 — Command working directories

PRD: [`docs/PRD-0.14.0-command-working-directory.md`](./docs/PRD-0.14.0-command-working-directory.md)

- Let command checks run from a committed subdirectory of the isolated worktree.

## Completed: 0.15.0 — Command output capture limits

PRD: [`docs/PRD-0.15.0-command-output-limits.md`](./docs/PRD-0.15.0-command-output-limits.md)

- Make the per-stream command output capture limit configurable within a strict bound.

## Current release work: 0.16.0 — Command standard input

PRD: [`docs/PRD-0.16.0-command-stdin.md`](./docs/PRD-0.16.0-command-stdin.md)

- Let command checks consume bounded text fixtures through stdin.

## Later

- Add check adapters only when their revision binding and evidence semantics are clear.
- Evaluate an OS-level sandbox before supporting checks from untrusted repositories.
- Publish the npm package only after the package name and release process are confirmed.

The project remains pre-1.0; see [`docs/compatibility.md`](./docs/compatibility.md) for contract evolution policy.

## Project principles

- A completion claim is not evidence; only configured checks determine results.
- A check proves only the behavior it exercises.
- Missing, failed, timed-out, or unbound evidence cannot count as a pass.
- A Git worktree isolates files and revision state, not process privileges.
- Never claim that a passing report establishes production safety or full correctness.
