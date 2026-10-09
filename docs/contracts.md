# Public contract inventory

This page indexes the current public input, output, command-line, and artifact contracts. It describes the current 0.45.0 release; it does not promise that they are stable before 1.0. Version markers are independent: package version 0.45.0, config version 1, report schema version 4, and manifest schema version 1.

## Configuration and check types

The CLI accepts a JSON config with `version: 1`, criteria, and checks. The canonical shape is [`config-v1.schema.json`](../schemas/config-v1.schema.json). Shipped examples cover [command](../agent-done-check.example.json), [browser](../agent-done-check.browser.example.json), [committed-file](../agent-done-check.file.example.json), and [HTTP](../agent-done-check.http.example.json) checks.

Check types are:

- `command`: shell string or direct argv execution in a detached worktree.
- `playwright`: browser steps with an optional external Playwright runtime; the README documents installation and commit binding.
- `file`: assertions against raw blobs at the requested Git commit.
- `http`: read-only GET requests whose response must prove the target commit.

The schema is intentionally extensible and allows additional properties. Runtime validation may also impose semantic constraints described in the README and examples; the schema alone is not a safety boundary.

## CLI surface

Run `agent-done-check --help` for the current syntax. The supported modes are:

| Mode | Purpose |
| --- | --- |
| Normal audit | `--config`, repeatable `--check`, `--commit`, `--output`, `--markdown-output`, optional `--sarif-output`, and optional `--junit-output`. |
| Config validation | `--validate` with optional `--config`; validates without running checks. |
| Bundle verification | `--verify-bundle` with optional `--manifest`; verifies listed artifact hashes/sizes without rerunning checks. |
| Help/version | `--help` and `--version`. |

Exit status is 0 when a normal audit passes, validation succeeds, bundle verification succeeds, or help/version is shown. It is 1 when an audit has failed or unverified criteria, or a bundle is inconsistent. It is 2 for invalid or unreadable config, malformed/unreadable manifest, invalid CLI usage, or setup errors that prevent a valid run. The exact command forms and status semantics are explained in the README; changes to these semantics are contract changes.

## JSON report

Normal audits write a JSON report using [report schema v4](../schemas/report-v4.schema.json). Its required identity fields include `schemaVersion`, `tool`, `runId`, overall `status`, repository, commit, timestamps, reproducibility metadata, criteria, and checks. Status values are `passed`, `failed`, and `unverified`. `checkSelection` records focused runs; omitted configured checks do not imply success.

Historical report schemas remain available for [v3](../schemas/report-v3.schema.json) and [v2](../schemas/report-v2.schema.json). Consumers should select by `schemaVersion` and validate with the matching schema.

## Evidence bundle

The default output directory is `.agent-done-check/`. A normal audit writes `report.json`, `report.md`, and `manifest.json`; optional SARIF/JUnit files and per-check evidence are included when generated. Evidence may include bounded command stdout/stderr and browser screenshots/diagnostics. Browser screenshots are enabled by default unless disabled in the check configuration. Captured artifacts can contain sensitive application output despite best-effort redaction.

The manifest follows [manifest schema v1](../schemas/manifest-v1.schema.json). It records the run ID, target commit, config hash, and each artifact's path, media type, size, and SHA-256. Per-run check evidence is stored under `.agent-done-check/evidence/<run-id>/`. `--verify-bundle` checks consistency and containment; it does not prove authorship or authenticity.

## Security boundary

Verification configs are trusted policy. Command checks run with the invoking user's privileges; checks are not sandboxed. File checks read the target commit's Git objects. HTTP checks can reach addresses available to the host. Playwright navigates to configured URLs and may capture screenshots. Limits and redaction reduce risk but do not make hostile configs safe or guarantee that transformed secrets cannot leak. See [Results and safety](../README.md#results-and-safety).

## Stability status

This is an inventory of current behavior, not a stability declaration. Stability guarantees, supported environments, and the support window remain part of the [1.0 readiness work](./PRD-1.0.0-readiness.md) and require explicit maintainer approval.
