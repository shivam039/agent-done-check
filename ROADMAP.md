# Agent Done Check roadmap

## Completed: 0.33.0 — Per-check file byte limit

PRD: [`docs/PRD-0.33.0-per-check-file-byte-limit.md`](./docs/PRD-0.33.0-per-check-file-byte-limit.md)

- Allow file checks to lower their blob read cap while preserving the global 1 MiB maximum.

## Completed: 0.32.0 — HTTP JSON Pointer existence assertions

PRD: [`docs/PRD-0.32.0-http-json-pointer-exists.md`](./docs/PRD-0.32.0-http-json-pointer-exists.md)

- Assert that an RFC 6901 pointer resolves in a commit-bound HTTP JSON body, without knowing or recording its value.

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

## Completed: 0.16.0 — Command standard input

PRD: [`docs/PRD-0.16.0-command-stdin.md`](./docs/PRD-0.16.0-command-stdin.md)

- Let command checks consume bounded text fixtures through stdin.

## Completed: 0.17.0 — Select checks for a focused run

PRD: [`docs/PRD-0.17.0-select-checks.md`](./docs/PRD-0.17.0-select-checks.md)

- Support repeatable check ID selection while keeping omitted criteria unverified.

## Completed: 0.18.0 — Per-check command environment

PRD: [`docs/PRD-0.18.0-per-check-environment.md`](./docs/PRD-0.18.0-per-check-environment.md)

- Add isolated environment overrides for command checks.

## Completed: 0.19.0 — HTTP response header assertions

PRD: [`docs/PRD-0.19.0-http-response-headers.md`](./docs/PRD-0.19.0-http-response-headers.md)

- Verify exact response header values only after the HTTP response is bound to the target commit.

## Completed: 0.20.0 — JSON Pointer file checks

PRD: [`docs/PRD-0.20.0-json-pointer-file-checks.md`](./docs/PRD-0.20.0-json-pointer-file-checks.md)

- Compare typed JSON values at RFC 6901 pointers in committed files.

## Completed: 0.21.0 — HTTP response body digest assertions

PRD: [`docs/PRD-0.21.0-http-body-digest.md`](./docs/PRD-0.21.0-http-body-digest.md)

- Verify bounded raw HTTP response bytes by SHA-256 after commit binding.

## Completed: 0.22.0 — HTTP report schema alignment

PRD: [`docs/PRD-0.22.0-http-report-schema.md`](./docs/PRD-0.22.0-http-report-schema.md)

- Describe HTTP header and body digest match evidence in report schema v4.

## Completed: 0.23.0 — Per-check HTTP body limits

PRD: [`docs/PRD-0.23.0-http-body-limit.md`](./docs/PRD-0.23.0-http-body-limit.md)

- Let an HTTP check lower its response body byte cap up to the existing hard limit.

## Completed: 0.24.0 — JSON Pointer existence assertions

PRD: [`docs/PRD-0.24.0-json-pointer-exists.md`](./docs/PRD-0.24.0-json-pointer-exists.md)

- Check that a JSON Pointer resolves in a committed JSON file without matching its value.

## Completed: 0.25.0 — HTTP JSON Pointer assertions

PRD: [`docs/PRD-0.25.0-http-json-pointer.md`](./docs/PRD-0.25.0-http-json-pointer.md)

- Compare a typed JSON value at an RFC 6901 pointer in a bound HTTP response.

## Completed: 0.26.0 — Multiple acceptable HTTP statuses

PRD: [`docs/PRD-0.26.0-http-status-list.md`](./docs/PRD-0.26.0-http-status-list.md)

- Accept a bounded list of exact HTTP response status codes per check.

## Completed: 0.27.0 — Shell-free argv commands

PRD: [`docs/PRD-0.27.0-argv-commands.md`](./docs/PRD-0.27.0-argv-commands.md)

- Let command checks pass program and arguments directly without a shell.

## Completed: 0.28.0 — Multiple expected command exit codes

PRD: [`docs/PRD-0.28.0-command-exit-code-list.md`](./docs/PRD-0.28.0-command-exit-code-list.md)

- Accept a bounded list of successful exit codes for command checks.

## Completed: 0.29.0 — Required HTTP response headers

PRD: [`docs/PRD-0.29.0-http-required-headers.md`](./docs/PRD-0.29.0-http-required-headers.md)

- Assert that selected response header names are present after commit binding.

## Completed: 0.30.0 — HTTP content-type assertion

PRD: [`docs/PRD-0.30.0-http-content-type.md`](./docs/PRD-0.30.0-http-content-type.md)

- Assert the normalized response media type after commit binding and before reading its body.

## Completed: 0.31.0 — Normalized HTTP content-type evidence evidence

PRD: [`docs/PRD-0.31.0-http-response-content-type.md`](./docs/PRD-0.31.0-http-response-content-type.md)

- Record a normalized media type after commit binding without exposing parameters.

## Later
