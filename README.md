# CommitProof

CommitProof is an independent verification CLI for software changes. Give it acceptance criteria and explicit commands; it checks out the requested Git commit in a temporary worktree, runs the checks there, and writes a report bound to that commit.

The coding agent's completion message is not an input to the verdict. CommitProof does not generate or repair application code.

## Requirements

- Node.js 20 or newer
- Git

## Use from a repository

Install the package once published:

```sh
npm install --save-dev commitproof-cli
npx commitproof --config commitproof.json
```

Copy [`commitproof.example.json`](./commitproof.example.json) to `commitproof.json` and adapt it to the application. For example:

```json
{
  "version": 1,
  "timeoutMs": 120000,
  "criteria": [
    { "id": "login", "description": "A user can sign in with valid credentials." },
    { "id": "regression", "description": "The existing test suite remains green." }
  ],
  "checks": [
    { "id": "login-browser", "command": "npm ci && npm run test:e2e -- --grep login", "criteria": ["login"] },
    { "id": "unit-suite", "command": "npm ci && npm test", "criteria": ["regression"] }
  ]
}
```

Run `commitproof` from the Git repository. It defaults to `HEAD`; use `--commit <sha>` to select another revision. By default it writes `.commitproof/report.json`, `.commitproof/report.md`, `.commitproof/manifest.json`, and captured output files under `.commitproof/evidence/<run-id>/`. Override the report destinations with `--output` and `--markdown-output`. Each check gets a fresh temporary detached worktree at that commit, with a bounded timeout. A check that leaves tracked or non-ignored files changed, or moves `HEAD`, cannot pass. This ensures revision consistency, but it is not a security sandbox: checks execute shell commands and repository code on the host, inheriting the host environment plus optional configured `env` values. Only use trusted repositories and verification configs.

Statuses are `passed`, `failed`, and `unverified`. A criterion without a mapped check, or with any timed-out/unstartable check, is `unverified`. The overall process exits 0 only when every criterion passes, 1 for failed or unverified criteria, and 2 for configuration or setup errors. Config errors include field paths and are collected together. The manifest contains SHA-256 hashes and byte sizes for the reports and captured check outputs. Each check output is capped to its final 24 KB; truncation is marked in the JSON report. The JSON report also records the config hash, Node version, platform, architecture, locale, and timezone to help reproduce a run.

## Browser scenarios

CommitProof has a built-in Playwright scenario runner. Copy [`commitproof.browser.example.json`](./commitproof.browser.example.json) and configure a `type: "playwright"` check with a reachable application URL and ordered steps. Supported actions are `click`, `fill`, `check`, `uncheck`, `selectOption`, `press`, `expectVisible`, `expectHidden`, `expectText`, `expectValue`, and `expectUrl`. Use CSS selectors or Playwright locator selectors. A scenario captures a viewport screenshot and records console errors, uncaught page errors, failed requests, and HTTP error responses. Uncaught page errors fail by default; the other diagnostic groups can be made fatal with their `failOn...` options.

The verified worktree must install the `playwright` package and browser binary. Use `setupCommand` for that, such as `npm ci && npx playwright install chromium`; this command runs once on the host inside the temporary worktree and counts against the check timeout. The browser check's `url` must already be reachable (for example, a staging deployment). To receive a passing result, configure `commitAssertion` to read the full commit SHA exposed by the app, such as a `<meta name="commit-sha" content="...">` element. A browser scenario without a matching commit marker still runs but is `unverified`; it cannot prove that the requested commit is what the URL serves. Browser setup failures are also `unverified`; scenario assertion failures against a matching revision are `failed`. Browser URLs in reports have credentials, query strings, and fragments removed. Screenshots can still contain sensitive application data, so protect the evidence directory.

Shell-check output and browser evidence are stored in the report bundle, so avoid printing credentials or other secrets from verification commands and protect the `.commitproof` directory.

## Development

```sh
npm test
```

The CLI supports Node.js 20+ on macOS, Linux, and Windows. Timeouts terminate the spawned process tree where the platform allows it.

See [`ROADMAP.md`](./ROADMAP.md) for the master epic and release sequence.

For a CI starting point, see [`examples/github-actions.yml`](./examples/github-actions.yml). The workflow checks out full Git history, runs CommitProof against the pull request or push commit, and uploads the report bundle.

## License

MIT
