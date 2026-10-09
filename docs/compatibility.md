# Compatibility and migration policy

Agent Done Check is pre-1.0. Its current contracts are configuration `version: 1`, JSON report `schemaVersion: 4`, and manifest `schemaVersion: 1`. Report schema v3 and v2 remain documented by their versioned schemas. The schemas for these contracts live in [`schemas/`](../schemas/).

## Version markers

- Config `version` selects the input language understood by the CLI.
- Report `schemaVersion` selects the JSON report shape.
- Manifest `schemaVersion` selects the artifact manifest shape.
- The package version identifies a tool release and does not replace any of these contract markers.

Consumers should branch on the relevant marker and ignore unrecognized object properties. Schemas allow additive properties so integrations can tolerate compatible additions.

## Compatible changes

The project may add optional config properties with safe defaults, add optional report or manifest properties, add new diagnostic details, or expand documentation without changing a contract marker. A new config property must not silently change the meaning of an existing property. Output consumers should ignore properties they do not use and must not depend on object key order.

## Breaking changes

A change is breaking if it removes a documented property, changes a property's type or meaning, changes a config default in a way that alters check execution or results, rejects previously valid documented input, changes status semantics, or changes artifact hash/path interpretation. Breaking changes require a new applicable contract version and updated schema. The CLI will continue supporting the previous contract for at least one minor release after a deprecation notice, unless a security issue requires faster removal.

Before 1.0, breaking changes may be made with explicit migration notes and the appropriate marker/schema increment. The maintainers will document affected fields, old and new behavior, upgrade steps, and the first release that removes deprecated behavior. No compatibility guarantee beyond this published policy is implied by the 0.x package version.

Report schema v3 adds the `file` check type and its result metadata. Report schema v4 adds HTTP check results and additive command result metadata, including focused-run selection fields. Consumers that validate reports against v2 or v3 should use the matching versioned schema; v4 reports use the v4 schema. Config remains version 1 because these check options and types are additive.

After 1.0, package releases will follow semantic versioning: breaking public API or contract changes require a major package version; compatible additions use a minor version; fixes that do not change documented behavior use a patch version. Contract markers and schemas remain independently versioned and increment when their contract changes.

## Deprecation and migration

Deprecations will be documented in release notes and this policy, including the affected contract marker, replacement behavior, and removal target. Where practical, the CLI will emit a clear warning while deprecated input remains supported. Migration examples will be added to the README or a focused guide. Schema changes and release notes must land together.

## Guarantees not yet made

This policy documents how contract changes are handled; it does not declare the project stable. A 1.0 release will separately state the supported Node.js versions, contract guarantees, and release support window. Checks continue to execute unsandboxed with the host user's privileges, and schemas validate shape rather than proving that checks are safe or meaningful.

See the [1.0 release readiness checklist](./v1-readiness-checklist.md) for the broader contract, reliability, security, consumer, and release criteria. The checklist records evidence and does not itself declare the project stable.
