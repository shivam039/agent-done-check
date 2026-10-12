# PRD 0.46.0 — Clean-consumer package smoke test

## Problem

The repository's tests run from the source checkout, so they do not prove that the packed npm artifact contains the files needed by a consumer or that the installed binary works outside the project checkout. A package can pass its source tests while a release tarball is incomplete or misconfigured.

## Product change

Add a cross-platform CI smoke test that packs the current project, installs that tarball into a new temporary consumer repository, validates its config, and completes one command check against a committed revision. Run it for the existing Node.js 22/24 and Ubuntu/macOS/Windows CI matrix.

## Contract and safety

- Do not add runtime or development dependencies.
- Keep config v1, report v4, manifest v1, and CLI behavior unchanged.
- Use a locally generated tarball; do not publish to npm or use registry credentials.
- The consumer check must run only a fixed, harmless `node --version` command against its temporary fixture.
- Clean up temporary files on success and failure, and avoid relying on repository checkout paths from inside the consumer project.

## Acceptance criteria

- Pack the npm artifact and install it into a fresh project on all six existing CI matrix combinations.
- Confirm the installed binary responds to `--version` and `--help` and validates a consumer config.
- Initialize a clean Git repository, commit the config, run an audit through the installed binary, and assert a passed JSON report bound to that commit.
- Fail CI when required files are missing, installation fails, the binary cannot run, or the real audit does not pass.
- Update the v1 readiness checklist with CI evidence, the README's development/CI guidance, roadmap, changelog, and package version/docs list.

## Adversarial review

- Ensure the smoke test runs the binary from `node_modules`, not the source checkout or globally installed package.
- Ensure paths with spaces and Windows shell behavior are handled by the script.
- Ensure the generated config cannot execute arbitrary or host-provided commands.
- Ensure cleanup executes after failures and no tarball, npm credential, or temporary report is committed.
- Ensure this test verifies the exact package contents selected by `npm pack` and does not claim to validate every user workflow.

## Out of scope

- Declaring the complete Node.js/Git/OS support policy or 1.x compatibility guarantee.
- Publishing or tagging a release from this PR.
- Replacing the existing source-level test suite.
