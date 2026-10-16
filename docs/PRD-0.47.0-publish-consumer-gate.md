# PRD 0.47.0 — Verify the package before npm publishing

## Problem

The npm release workflow verifies that a published GitHub release tag matches `package.json` and runs source tests, but source tests alone do not prove that the release tarball contains a usable CLI. A package-content or install regression could therefore reach the publish step even though the existing CI clean-consumer test covers ordinary branch builds.

## Product change

Run the existing packed-package clean-consumer smoke test in the npm publish workflow after tag/version verification and source tests, and before `npm publish`. The workflow checks the release tag's checkout; the smoke test packs that checkout, installs the tarball in a fresh temporary consumer, and runs its commit-bound CLI audit.

## Contract and safety

- Keep the `release: published` trigger, GitHub permissions, OIDC publishing, and tag/version guard unchanged.
- A failed clean-consumer check must stop the job before the publish step.
- Use the same locally generated tarball smoke test as CI; do not publish a staging package or require registry credentials for the test.
- Keep config v1, report v4, manifest v1, and CLI behavior unchanged.
- This change does not publish or tag a release.

## Acceptance criteria

- The release workflow runs the clean-consumer test on Node.js 24 after source tests and before npm publish.
- The test installs and runs the package tarball produced from the release-tag checkout.
- Failure in packing, installing, required package contents, or the installed CLI prevents npm publish.
- Update release documentation, current package metadata, changelog, roadmap, and the packaged PRD list.

## Adversarial review

- Verify step ordering makes the publish command unreachable after a failed smoke test.
- Verify the release tag/version guard runs before packaging and publishing.
- Verify the smoke test uses the local tarball and installed binary, without invoking a global or source-tree CLI.
- Verify the smoke fixture runs only its fixed `node --version` command and cleans temporary files on failure.
- Confirm no workflow change grants broader token permissions or changes the publish trigger.

## Out of scope

- Publishing 0.47.0 or creating a Git tag/release.
- Changing npm Trusted Publishing configuration, provenance behavior, release support policy, or the 1.0 go/no-go checklist.
- Replacing the existing multi-platform branch CI matrix.
