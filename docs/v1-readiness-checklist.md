# 1.0.0 release readiness checklist

This checklist defines the evidence to gather before declaring Agent Done Check stable at 1.0. It is a release gate, not a promise that every item is already complete. Keep items unchecked until their evidence is linked from the release PR or this document.

## Contract and compatibility

- [ ] Publish a contract inventory for config v1, report v4, manifest v1, CLI commands, exit codes, and evidence files; verify each description matches the implementation and schemas.
- [ ] State the exact Node.js versions and operating systems supported at 1.0, including the minimum Git version and any Playwright/browser prerequisites.
- [ ] Define the 1.x compatibility guarantee for config, report, manifest, CLI output, exit codes, and generated artifacts. Specify which additive changes are allowed and how consumers should handle unknown fields.
- [ ] Confirm schema IDs, versions, and README references are correct. Include migration guidance for report schemas v2 and v3 and identify which schema versions remain supported.
- [ ] Define deprecation notice and removal periods, including the security exception, and ensure the documented policy matches actual release practice.
- [ ] Choose and publish the support window: maintenance duration for 1.x, security-fix expectations, and how end-of-support will be announced.

## Reliability and security

- [ ] Pass the complete CI matrix on every declared Node.js and operating-system combination; document any excluded combinations and why.
- [ ] Review every check adapter's timeout, output/body/file limits, path handling, commit binding, and error-to-status behavior against adversarial fixtures.
- [ ] Document the security boundary plainly: configs execute commands with the host user's privileges; checks are not sandboxed; network probes can reach host-accessible addresses; redaction is best-effort.
- [ ] Complete an adversarial review of secret handling, environment inheritance, filesystem/worktree isolation, HTTP probing, browser navigation, screenshots, and report contents; resolve or explicitly accept each finding.
- [ ] Verify deterministic report and manifest behavior, including failure, timeout, unverified, partial-check, malformed-input, and interrupted-run cases.
- [ ] Record any known limitations and supported operational mitigations in a security and limitations section.

## Consumer and documentation readiness

- [ ] Validate the documented install and CLI flows from a clean consumer project using the packed tarball and the declared minimum Node.js version.
- [ ] Exercise command, file, HTTP, and Playwright examples against representative consumer projects; record feedback and resolve release-blocking issues.
- [ ] Review the README, compatibility policy, examples, schemas, roadmap, changelog, and every packaged PRD for accuracy and consistency with the shipped code.
- [ ] Explain how to install and configure optional Playwright/browser dependencies, what browser versions are supported, and how browser checks behave when dependencies are absent.
- [ ] Provide a migration guide from the latest 0.x release to 1.0, including changed defaults, breaking changes, schema validation, and rollback guidance.
- [ ] Add a support channel and a concise bug-report template that asks for the CLI version, Node/Git versions, operating system, sanitized config, and relevant report evidence.

## Package and release operations

- [x] Confirm npm Trusted Publishing succeeds from the configured GitHub Actions workflow. First successful OIDC publish completed for 0.45.0 on 2026-10-09; npm reported the publisher as valid.
- [ ] Verify package metadata, MIT license detection, npm description and keywords, repository links, supported engine range, and public access on the 1.0 candidate.
- [ ] Review `npm pack --dry-run` output and install the resulting tarball in a clean project; confirm all required docs, schemas, examples, and executable files are included.
- [ ] Confirm the release workflow checks tag/version agreement, runs the full CI suite, publishes provenance, and fails safely on any mismatch or test failure.
- [ ] Prepare release notes that call out the stability commitment, supported platforms, compatibility guarantees, migration steps, known limitations, and support window.
- [ ] Verify the 1.0 Git tag points to the reviewed `main` commit, the GitHub release and npm version agree, and the post-publish package page and install flow are correct.
- [ ] Document the recovery procedure for a failed or compromised release, including yanking/deprecation policy, follow-up patch release, and maintainer notification steps.

## Go / no-go decision

- [ ] All release-blocking items above are complete or have a written, maintainer-approved exception with an owner and follow-up date.
- [ ] A final adversarial review finds no unresolved critical or high-severity issue; accepted lower-severity findings are documented.
- [ ] Maintainers explicitly approve the 1.0 stability and support commitments before publishing the 1.0.0 tag.
