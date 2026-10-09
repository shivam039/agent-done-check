# PRD — Agent Done Check 1.0.0 readiness

## Status

Planning and staged readiness work. This PRD does not authorize or announce a 1.0 release.

## Problem

The project has a broad 1.0 readiness checklist, but it lacks a product-level plan that sequences the work, defines evidence for each gate, and keeps unresolved support and stability decisions visible. Shipping more 0.x features alone does not establish that contracts are stable, supported environments are understood, or consumers can upgrade safely.

## Goal

Make a deliberate 1.0 go/no-go decision possible by documenting the public contracts, validating them against implementation and schemas, gathering compatibility and security evidence, testing consumer adoption, and preparing reliable release and support operations.

## Non-goals

- Do not declare the current 0.x behavior stable or publish 1.0 as part of this PRD.
- Do not promise a Node.js, Git, operating-system, browser, or support window before compatibility evidence and maintainer decisions exist.
- Do not add feature work solely to increase the version number.
- Do not treat schema validation or redaction as a security sandbox or safety proof.

## Users and needs

- CLI users need exact install, runtime, exit-code, and failure semantics.
- Integrators need versioned config, report, and manifest contracts plus migration guidance.
- Maintainers need measurable release gates, a support policy, and a repeatable publishing and recovery process.
- Security reviewers need explicit trust boundaries and evidence for secrets, filesystem access, network probes, browser diagnostics, and reports.

## Product requirements

1. Maintain a public contract inventory for config v1, report v4, manifest v1, CLI commands and exit codes, and emitted evidence files. It must link to source schemas and authoritative examples.
2. Declare exact supported Node.js and Git versions, operating systems, and optional Playwright/browser prerequisites for 1.0, backed by CI and clean-consumer validation.
3. State 1.x compatibility guarantees for config, reports, manifests, CLI output, exit codes, and artifacts. Define additive changes, breaking changes, deprecation/removal periods, and the security exception.
4. Provide migration guidance from 0.x to 1.0, including contract versions, behavior changes, rollback, and schema-version support.
5. Complete reliability and adversarial security review across command, file, HTTP, and Playwright checks; record findings, fixes, and accepted limitations.
6. Validate documentation and representative examples from a clean consumer installation of the packed package on the declared minimum runtime.
7. Confirm npm metadata, package contents, CI gates, Trusted Publishing/provenance, release notes, tag/version agreement, post-publish install, and recovery procedures.
8. Record a final maintainer go/no-go decision. No 1.0 tag may be created while a release-blocking item lacks evidence or an explicitly approved exception with owner and follow-up date.

## Delivery stages

1. **Contract inventory:** document current interfaces and correct existing documentation discrepancies.
2. **Compatibility decisions:** gather runtime evidence; decide supported platforms, contract guarantees, deprecation periods, migration policy, and support window.
3. **Reliability and security evidence:** inspect all adapters and edge cases; run adversarial review and resolve or accept findings.
4. **Consumer and package validation:** test examples and packed installs with representative consumers; finish package/release/recovery documentation.
5. **Release gate:** assemble evidence, publish release notes, complete final adversarial review, and obtain explicit maintainer approval.

Track the individual requirements and their evidence in [`v1-readiness-checklist.md`](./v1-readiness-checklist.md). Work should land in small reviewed PRs; update the checklist only when the PR contains or links the evidence that satisfies the item.

## Acceptance criteria

- [ ] Every readiness item has an owner or is explicitly identified as requiring a maintainer decision.
- [x] The current contract inventory is accurate against CLI help, runtime behavior, schemas, README, and examples. Initial inventory is in [`contracts.md`](./contracts.md); future behavior changes must keep it current.
- [ ] Supported runtime/platform claims are backed by CI and clean-consumer results.
- [ ] Compatibility and deprecation guarantees are explicit, internally consistent, and reflected in schemas and migration guidance.
- [ ] Security and reliability reviews have no unresolved critical or high-severity findings; accepted lower-severity findings and limitations are documented.
- [ ] The packed candidate installs and its documented command flows work on the declared minimum runtime.
- [ ] Release and recovery operations are documented and a release candidate passes all checks.
- [ ] Maintainers approve the 1.0 stability and support commitments before the 1.0.0 release is published.

## Current baseline and open decisions

- Current package version is 0.45.0; config is v1, report is v4, manifest is v1.
- CI currently covers Node.js 22 and 24 on Ubuntu, macOS, and Windows. This is evidence of tested combinations, not yet a support promise.
- npm Trusted Publishing completed a successful OIDC publish for 0.45.0 on 2026-10-09; the publisher was reported Valid.
- The exact minimum Git version, the 1.x support window, contract support/deprecation periods, external-consumer evidence, and the final stability guarantee remain unresolved.

## Adversarial review prompts

- Could any statement be misread as a 1.0 stability promise before approval?
- Do checked checklist items link to observable evidence, and are pending decisions presented as pending?
- Do compatibility guarantees cover every user-visible output, including exit codes, error text, evidence files, and schema changes?
- Does the plan imply that redaction, schemas, read-only HTTP checks, or worktrees sandbox hostile configurations?
- Can release validation accidentally publish the wrong tag, package version, or source commit?
