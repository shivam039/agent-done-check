# Agent Done Check roadmap

## Current release: 0.4.0 — Safer adoption

Implemented:

- By default, checks inherit only platform basics required to run tools. Additional host variables must be listed in `inheritEnv`.
- `redactEnv` masks named host/config values in captured command output and browser diagnostics. Common bearer, GitHub, OpenAI-style, and JWT token patterns are masked too.
- The GitHub Actions examples use read-only repository permissions and disable checkout credential persistence; a reusable workflow is available for trusted caller repositories.
- GitHub Actions dependencies are pinned to verified commits on Node.js 24-compatible release lines.
- Project CI is configured to run tests on Linux, macOS, and Windows with Node.js 22 and 24.
- Known GitHub Actions credential/control variables and npm publish tokens are rejected from `inheritEnv`.
- Documentation explains the limits of masking, shell execution, and worktree isolation.

Redaction is best-effort. It cannot reliably identify transformed secrets or data in screenshots. Checks remain unsandboxed and run with the host user's privileges; do not run untrusted verification configs or grant untrusted code access to sensitive variables.

## Current release work: 0.5.0 — Stable integration contract

PRD: [`docs/PRD-0.5.0-stable-integration-contract.md`](./docs/PRD-0.5.0-stable-integration-contract.md)

- Publish JSON Schemas for config v1, report schema v2, and manifest schema v1.
- Document pre-1.0 compatibility, deprecation, and migration policy.
- Validate examples and generated report/manifest output against the schemas in tests.

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
