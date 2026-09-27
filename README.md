# Agent Done Check

Agent Done Check is a local and CI tool for checking whether a specific Git commit satisfies explicit acceptance criteria. You provide the criteria and the commands or browser steps that verify them. The tool runs each check in a fresh detached worktree and writes a report tied to the exact commit.

It does not decide whether requirements are complete on its own, inspect an AI agent's conversation, or modify application code. A passing result means only that the configured checks passed.

## Requirements

- Node.js 22 or newer
- Git

## Install and run

The package is not published to npm yet. From this checkout, run:

```sh
npm install
node ./bin/agent-done-check.js --config agent-done-check.json
```

To verify a specific revision, add `--commit <full-or-resolvable-revision>`. The default is `HEAD`. By default, the JSON report, Markdown report, and manifest are written under `.agent-done-check/`. Captured command output and browser screenshots are stored under `.agent-done-check/evidence/<run-id>/`. The `--output` and `--markdown-output` options can change the report paths.

Pass `--check <id>` one or more times to rerun selected checks, for example `--check unit-tests --check lint`. The checks run in configuration order. Reports identify the selection; any acceptance criterion that depends on an omitted check remains `unverified`, so a focused run cannot imply that the full configured suite passed. JSON and Markdown identify omitted check IDs, SARIF emits warnings for them, and JUnit lists them as skipped. Omit `--check` to run every configured check. Selection is an audit-only option and cannot be combined with `--validate` or `--verify-bundle`.

Copy [`agent-done-check.example.json`](./agent-done-check.example.json) to `agent-done-check.json` and replace its example criteria and commands with checks for your project. A command check looks like this:

```json
{
  "version": 1,
  "timeoutMs": 120000,
  "inheritEnv": ["TEST_API_TOKEN"],
  "redactEnv": ["TEST_API_TOKEN"],
  "criteria": [
    { "id": "tests", "description": "The project test suite passes." }
  ],
  "checks": [
    {
      "id": "unit-tests",
      "command": "npm ci && npm test",
      "criteria": ["tests"]
    }
  ]
}
```

The config must be JSON. Each criterion must be referenced by at least one check to pass. Command checks run through the platform shell in a fresh detached Git worktree. Each check has a bounded timeout. A timeout or setup problem is `unverified`; a nonzero check exit is `failed`; a zero exit is `passed` only if the check did not change the checked-out source or move `HEAD`.

Checks receive a small platform baseline environment by default (`PATH` and temporary/home/locale variables where available). They do not inherit arbitrary host variables. Use `inheritEnv` to pass named variables from the invoking process and `env` to set non-secret values in the config. For example, use `inheritEnv: ["TEST_API_TOKEN"]` to make that host variable available. Known GitHub Actions runner credentials/control variables and npm publish tokens are blocked from inheritance. Avoid putting secrets in a checked-in config. Treat the config as executable policy: it controls commands and can explicitly grant access to host environment values.

## Browser checks

Playwright checks use the `type: "playwright"` configuration shown in [`agent-done-check.browser.example.json`](./agent-done-check.browser.example.json). They support `click`, `fill`, `check`, `uncheck`, `selectOption`, `press`, `expectVisible`, `expectHidden`, `expectText`, `expectValue`, and `expectUrl` steps.

The target URL must already be reachable. To count as passed, the page must expose the exact requested commit SHA through the configured `commitAssertion`; otherwise the result is `unverified`. The temporary worktree needs Playwright and its browser installed. Use `setupCommand` for installation. Browser checks capture a viewport screenshot by default and record page errors, console errors, failed requests, and HTTP error responses. Uncaught page errors fail by default; the other diagnostics fail a check only when their `failOn...` option is set to `true`. The browser example contains placeholder URL and login values; replace them with a test environment and never commit real credentials.

## Results and safety

Criterion and overall statuses are `passed`, `failed`, or `unverified`. The process exits with:

- `0` when every criterion passed
- `1` when any criterion failed or remains unverified
- `2` for invalid configuration or a setup error that prevents the run

Reports include the repository name, full commit SHA, config hash, run ID, runtime details, criterion-to-check mapping, and check outcomes. The manifest records SHA-256 hashes and byte sizes for report and evidence artifacts. Captured stdout and stderr are each limited to their final 24,000 bytes. Set `redactEnv` to environment variable names whose values should be replaced in captured output and browser diagnostics; browser step values and common bearer, GitHub, OpenAI-style, and JWT token patterns are also masked. Exact-value masking applies to values at least four characters long.

**Checks are not sandboxed.** They execute project code and shell commands on the host with the host user's privileges. Use trusted repositories and configs. Redaction reduces accidental disclosure but is not a guarantee: secrets can be transformed, split, encoded, or appear in screenshots. Do not let untrusted checks receive sensitive host environment variables. Browser URLs in reports have credentials, query strings, and fragments removed.

## Development and CI

Run the test suite with:

```sh
npm test
```

For GitHub Actions, see [`examples/github-actions.yml`](./examples/github-actions.yml). It runs checks against the triggering commit and uploads the report bundle. Review and adapt the sample workflow before using it: it runs commands from the repository under test.

Other repositories can call the read-only reusable workflow at [`.github/workflows/reusable-verify.yml`](./.github/workflows/reusable-verify.yml). Pin both the workflow ref and its `tool-ref` input to a reviewed commit SHA or release tag:

```yaml
jobs:
  verify:
    uses: shivam039/agent-done-check/.github/workflows/reusable-verify.yml@<reviewed-ref>
    with:
      tool-ref: <reviewed-ref>
      config: agent-done-check.json
```

The reusable workflow does not pass repository secrets to checks. It still runs commands from the caller's verification config and checkout; only use it with trusted configuration and contributions.

See [`ROADMAP.md`](./ROADMAP.md) for implemented capabilities and planned work. The project is licensed under MIT.

## Integration contracts

JSON Schemas are published in [`schemas/`](./schemas/): [config v1](./schemas/config-v1.schema.json), [current report schema v4](./schemas/report-v3.schema.json), [previous report schema v2](./schemas/report-v2.schema.json), and [manifest schema v1](./schemas/manifest-v1.schema.json). Config `version` identifies the input format; report and manifest `schemaVersion` identify their respective output formats. Use the matching schema to validate integrations. The schemas accept additional properties so consumers can tolerate compatible additions.

See [`docs/compatibility.md`](./docs/compatibility.md) for compatibility, deprecation, and migration policy. Agent Done Check remains pre-1.0; this policy does not announce a 1.0 stability guarantee.

### Commit-bound file checks

Use `type: "file"` for simple assertions against files in the exact commit under verification. The adapter supports `exists`, exact UTF-8 `equals`, UTF-8 substring `contains`, and SHA-256 `sha256` assertions. See [`agent-done-check.file.example.json`](./agent-done-check.file.example.json) for a complete config. Paths must be normalized relative paths to regular files in the target commit; symbolic links are unverified. Files are limited to 1 MiB. The adapter reads raw Git blobs so checkout filters and platform line-ending rules do not change results. Reports include only assertion metadata, byte count, and file hash, never file contents or the configured expected value. These checks prove a property of committed file bytes, not runtime behavior.

The current JSON report schema is [schema v4](./schemas/report-v4.schema.json). Earlier v3 and v2 reports remain described by [schema v3](./schemas/report-v3.schema.json) and [schema v2](./schemas/report-v2.schema.json). Manifest schema remains [v1](./schemas/manifest-v1.schema.json).

### Commit-bound HTTP checks

Use `type: "http"` for a read-only `GET` probe. The response must include the exact target commit SHA in `x-agent-done-check-commit` (or a configured `commitHeader`) before its status, optional UTF-8 `bodyContains`, or `responseHeaders` assertions can pass. `responseHeaders` accepts up to 20 header-name/value pairs and compares normalized names case-insensitively and values exactly. Missing or mismatched expected headers fail only after commit binding succeeds; unbound responses remain unverified. Reports record header names and match booleans, never expected or observed values. Redirects are rejected, request headers and bodies cannot be configured, and response bodies are capped at 1 MiB. Reports contain a sanitized URL, HTTP status, revision-binding result, body byte count and SHA-256; response content and commit-header values are never recorded. Missing or mismatched commit evidence, timeouts, redirects, oversized bodies, and invalid UTF-8 are unverified. See [`agent-done-check.http.example.json`](./agent-done-check.http.example.json). Configs are trusted policy and can still probe any network address available to the host.

### Validate a config without running it

Run `node ./bin/agent-done-check.js --validate` to check `agent-done-check.json`, or pass `--config <file>` for another path. Validation works outside a Git repository and never executes configured checks. It prints one JSON object: valid results include `valid`, `configPath`, `criterionCount`, and `checkCount`; invalid results include `valid: false` and an `errors` array. The command exits 0 for valid input and 2 for invalid, unreadable, or malformed input.

### Verify an existing report bundle

Run `node ./bin/agent-done-check.js --verify-bundle` to check `.agent-done-check/manifest.json`, or use `--manifest <file>` to select another manifest. The command verifies the report identity, each listed file's byte count and SHA-256, and keeps resolved artifact paths inside the manifest directory. It works outside a Git repository and never reruns checks. Exit status is 0 for a valid bundle, 1 for missing or inconsistent artifacts, and 2 for an unreadable or malformed manifest. A matching unsigned manifest proves internal consistency, not authorship or authenticity.

### Export SARIF

Pass `--sarif-output <file>` during a normal audit to write a SARIF 2.1.0 log. Failed checks appear as `error` results and unverified checks as `warning`; passed checks are omitted. SARIF messages include only the check ID and status, not captured command output or arbitrary check errors. The SARIF file is included in the evidence manifest. See the [OASIS SARIF 2.1.0 specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html).

### Export JUnit XML

Pass `--junit-output <file>` during a normal audit to write one testcase per configured check. Passed checks are successful cases, failed checks use `<failure>`, and unverified checks use `<skipped>`. The XML contains the run ID, target commit, and durations, but not captured command output or arbitrary check errors. The JUnit file is included in the evidence manifest. The [GitHub Actions example](./examples/github-actions.yml) writes both SARIF and JUnit files and uploads the report directory as a workflow artifact.

### Expected command exit code

Command checks pass on exit code 0 by default. Set `expectedExitCode` on a command check to use a different integer from 0 through 255. A different completed exit code fails; a timeout remains unverified. The check result records the expected value. This option applies only to command checks.

### Command output assertions

Command checks may set `stdoutContains` or `stderrContains` to a non-empty substring of at most 4096 characters. The report records only whether each assertion matched. Matching is evaluated before redaction, and configured substrings are redacted from captured stdout/stderr in JSON and evidence files. If a substring is absent from complete captured output the check fails. If it is absent from truncated output, the check is unverified because the missing prefix was not observed.

### Command working directory

Command checks start at the isolated worktree root by default. Set `workingDirectory` to a normalized relative directory such as `packages/api` to run from a committed subdirectory. Absolute paths, traversal, missing directories, files, and symlinks resolving outside the worktree are rejected or reported unverified. Reports record the relative directory, never its host absolute path.

### Command output capture limit

Each stdout and stderr stream keeps its final 24,000 bytes by default. Set command-only `maxOutputBytes` to an integer from 1024 to 1,048,576 to change that per-stream limit. Reports record the effective limit and whether either stream was truncated. Output substring assertions use captured bytes; an absent substring in truncated output remains unverified.

### Command standard input

Set command-only `stdin` to provide a text fixture of up to 65,536 characters. The runner writes the text to the command's standard input and closes the stream; omission preserves the existing empty-input/EOF behavior. The configured text is not recorded as a separate report field. Because a command can print what it reads, treat stdin contents as part of the trusted check configuration and use the usual output redaction controls.

### Per-check command environment

Set a command check's `env` object to add or override string values for that check only. Values merge after the global `env` object, while host values still come only from the `inheritEnv` allowlist. Add a variable name to `redactEnv` to mask both global and per-check values in output; exact-value masking applies to values at least four characters long. Git override and runner target marker variables cannot be set per check.
