# PRD: Agent Done Check 0.5.0 — Stable integration contract

**Status:** Approved for implementation  
**Target:** 0.5.0  
**Owner:** Agent Done Check maintainers

## Summary

Define the machine-readable and human-readable contracts that integrations rely on before the project approaches 1.0. Release 0.5.0 makes configuration, JSON reports, and artifact manifests discoverable through versioned JSON Schemas, states how those contracts evolve, and checks shipped examples and generated output against the schemas.

## Problem

Agent Done Check produces useful JSON but downstream tools currently need to infer its shape from implementation details. Consumers cannot reliably validate configuration before running checks or know which report changes are compatible. The roadmap already identifies these gaps as the next release focus.

## Goals

- Publish Draft 2020-12 JSON Schemas for configuration version 1, report schema version 2, and manifest schema version 1.
- Give each schema a stable `$id` under the project repository and commit the schema files in `schemas/`.
- Document versioning, compatibility, deprecation, and migration expectations for config and output contracts before 1.0.
- Add automated conformance checks for both example configurations and generated report/manifest artifacts.
- Keep the CLI runtime dependency-free; schema validation is a development/CI concern for this release.

## Non-goals

- Changing the current configuration version, report schema version, or manifest schema version.
- Adding new check adapters or changing check execution semantics.
- Claiming a 1.0 stability guarantee or freezing every future field.
- Publishing the npm package or creating a public release tag.
- Sandboxing arbitrary check commands.

## User stories

1. As an integration author, I can validate a config file with a published schema before running the CLI.
2. As a report consumer, I can validate reports and manifests and branch on explicit schema versions.
3. As a maintainer, I know when a change requires a schema version bump and how users will be warned and migrated.
4. As a contributor, I get CI feedback when an example or actual output drifts from its published schema.

## Requirements and acceptance criteria

### Schemas

- `schemas/config-v1.schema.json` documents all supported top-level, criterion, command-check, Playwright-check, browser-step, environment, and timeout fields.
- `schemas/report-v2.schema.json` describes every field emitted by the current JSON report, including command and browser check variants, diagnostics, artifacts, and optional values.
- `schemas/manifest-v1.schema.json` describes every field emitted by the current evidence manifest.
- Schemas use Draft 2020-12, have unique stable `$id` values, reject invalid enum/range/type values, and intentionally state whether unknown properties are allowed.
- Repository examples validate against the config schema.
- Integration documentation links to the schemas and explains config `version` versus output `schemaVersion`.

### Compatibility policy

- Add `docs/compatibility.md` defining compatible and breaking changes for config, report, and manifest contracts.
- A released major contract version remains supported until a documented deprecation window ends; before 1.0, breaking changes require explicit migration notes and the appropriate schema version increment.
- Additive output fields are allowed within a schema version; consumers should ignore unknown fields. Existing required fields cannot be removed or change type/meaning without a breaking version change.
- Config additions with safe defaults may be compatible; changing defaults, accepted values, or execution meaning requires explicit migration treatment.
- Document deprecation notices, release notes, schema locations, and the policy that 1.0 guarantees will be stated separately.

### Conformance checks

- `npm test` (or a dedicated CI script invoked by it) validates the shipped example configs against the config schema.
- An integration test runs a minimal command check, then validates its generated report and manifest against their schemas.
- Tests assert schema version markers and validate at least one browser-shaped check/result fixture without requiring a real browser installation.
- Schema validation tooling is a development dependency only and is not bundled into CLI runtime dependencies.

## Out of scope / deferred roadmap

- Additional adapters are deferred until their revision binding and evidence semantics can meet the project principles.
- OS-level sandbox evaluation is a separate security project; current checks remain unsandboxed and must only run trusted configs.
- npm publication waits for package-name and release-process confirmation.

## Rollout

Merge schema, policy, and conformance work on the default branch as 0.5.0-preparation. Do not publish to npm or create a release tag as part of this PRD. Release notes should call out the newly documented schemas and compatibility policy, and explicitly note that the project remains pre-1.0.

## Tracking issues

GitHub issues created from this PRD are linked from this section once available.

- [#1 Publish JSON Schemas for config, reports, and manifests](https://github.com/shivam039/agent-done-check/issues/1)
- [#2 Document compatibility and migration policy](https://github.com/shivam039/agent-done-check/issues/2)
- [#3 Add schema conformance tests for examples and generated artifacts](https://github.com/shivam039/agent-done-check/issues/3)
