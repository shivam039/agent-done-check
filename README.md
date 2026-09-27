# Agent Done Check

Agent Done Check is a local and CI tool for checking whether a specific Git commit satisfies explicit acceptance criteria. You provide the criteria and the commands or browser steps that verify them. The tool runs each check in a fresh detached worktree and writes a report tied to the exact commit.

It does not decide whether requirements are complete on its own, inspect an AI agent's conversation, or modify application code. A passing result means only that the configured checks passed.

## Requirements

- Node.js 20 or newer
- Git

## Install and run

The package is not published to npm yet. From this checkout, run:

```sh
npm install
node ./bin/agent-done-check.js --config agent-done-check.json
```

To verify a specific revision, add `--commit <full-or-resolvable-revision>`. The default is `HEAD`. By default, the JSON report, Markdown report, and manifest are written under `.agent-done-check/`. Captured command output and browser screenshots are stored under `.agent-done-check/evidence/<run-id>/`. The `--output` and `--markdown-output` options can change the report paths.

Copy [`agent-done-check.example.json`](./agent-done-check.example.json) to `agent-done-check.json` and replace its example criteria and commands with checks for your project. A command check looks like this:

```json
{
  "version": 1,
  "timeoutMs": 120000,
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

## Browser checks

Playwright checks use the `type: "playwright"` configuration shown in [`agent-done-check.browser.example.json`](./agent-done-check.browser.example.json). They support `click`, `fill`, `check`, `uncheck`, `selectOption`, `press`, `expectVisible`, `expectHidden`, `expectText`, `expectValue`, and `expectUrl` steps.

The target URL must already be reachable. To count as passed, the page must expose the exact requested commit SHA through the configured `commitAssertion`; otherwise the result is `unverified`. The temporary worktree needs Playwright and its browser installed. Use `setupCommand` for installation. Browser checks capture a viewport screenshot by default and record page errors, console errors, failed requests, and HTTP error responses. Uncaught page errors fail by default; the other diagnostics fail a check only when their `failOn...` option is set to `true`. The browser example contains placeholder URL and login values; replace them with a test environment and never commit real credentials.

## Results and safety

Criterion and overall statuses are `passed`, `failed`, or `unverified`. The process exits with:

- `0` when every criterion passed
- `1` when any criterion failed or remains unverified
- `2` for invalid configuration or a setup error that prevents the run

Reports include the repository name, full commit SHA, config hash, run ID, runtime details, criterion-to-check mapping, and check outcomes. The manifest records SHA-256 hashes and byte sizes for report and evidence artifacts. Captured stdout and stderr are each limited to their final 24,000 bytes.

**Checks are not sandboxed.** They execute project code and shell commands on the host and inherit the host environment, plus configured environment values. Use trusted repositories and configs. Avoid printing secrets: command output is saved as evidence. Browser screenshots may also contain sensitive data. Browser URLs in reports have credentials, query strings, and fragments removed.

## Development and CI

Run the test suite with:

```sh
npm test
```

For GitHub Actions, see [`examples/github-actions.yml`](./examples/github-actions.yml). It runs checks against the triggering commit and uploads the report bundle. Review and adapt the sample workflow before using it: it runs commands from the repository under test.

See [`ROADMAP.md`](./ROADMAP.md) for implemented capabilities and planned work. The project is licensed under MIT.
