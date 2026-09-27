# CommitProof master epic

## Product goal

Build a reusable, agent-neutral verification engine that determines whether an application meets explicit acceptance criteria. It runs checks independently of the coding agent and creates reproducible evidence tied to an exact Git revision.

CommitProof verifies a candidate change. It does not write or repair application code, infer intent from an agent's completion claim, or treat that claim as evidence.

## Master epic

**As a developer or CI system, I can submit acceptance criteria and a candidate revision and receive a reproducible report showing which criteria passed, failed, or remain unverified, with evidence for each result.**

### Epic 1: Acceptance contract

- Define a versioned, machine-readable format for criteria, checks, timeouts, environment, and evidence requirements.
- Validate IDs, references, and configuration before execution.
- Preserve criteria with no associated check as `unverified`.
- MVP status: v1 JSON contract implemented; field-level validation now aggregates errors, with bounded timeout and environment validation.

### Epic 2: Independent execution

- Resolve and record an exact commit.
- Run checks from a clean detached worktree, with bounded runtime and captured output.
- Distinguish command failure from setup errors, timeouts, and checks that could not run.
- MVP status: each check runs in a fresh detached worktree at the requested commit; tracked/untracked mutations invalidate passing evidence, and timeouts terminate the process tree where supported. OS-level sandboxing remains out of scope.

### Epic 3: Application behavior checks

- Support browser scenarios that assert observable application outcomes.
- Capture screenshots, console errors, and relevant network failures.
- Design an adapter interface for additional check types such as API checks.
- MVP status: first-class Playwright scenario checks support browser actions and assertions, capture viewport screenshots, report console/page/network diagnostics, and require an app-exposed full commit marker before passing.

### Epic 4: Revision and evidence binding

- Bind each result to repository identity, full commit SHA, config, and run.
- Detect stale evidence and avoid presenting diffs as behavioral proof.
- Store evidence with a manifest that connects artifacts to criteria and checks.
- MVP status: report records tool version, repository name, commit SHA, config hash, runtime metadata, criterion mapping, and bounded stdout/stderr; manifest hashes reports and output evidence.

### Epic 5: Completion report

- Produce human-readable and machine-readable reports.
- Report a criterion as passed only when its required checks pass; use failed for a failing check and unverified when proof is absent or incomplete.
- Provide CI-friendly exit codes and concise failure summaries.
- MVP status: JSON and Markdown reports, evidence manifest, captured output files, and exit codes implemented.

### Epic 6: Adoption and integration

- Ship a zero-dependency Node.js CLI with documented setup.
- Support local development and CI without requiring a specific coding agent.
- Add GitHub Actions guidance and publishing automation after package ownership is established.
- MVP status: CLI scaffold and npm package metadata implemented; package not yet published.

### Epic 7: Trust and operations

- Clearly label what the evidence establishes and what remains an inference.
- Keep secrets out of logs and artifacts; bound command duration and output.
- Document execution privileges and offer a hardened isolation mode before accepting untrusted repositories.
- MVP status: config, output, scenario, and diagnostic sizes are bounded; browser URL credentials and query strings are redacted in reports. Host execution is not sandboxed, and command output may contain secrets.

## Release sequence

1. **0.1 — Local proof runner:** JSON contract, exact-commit worktree, configured command checks, JSON report, exit codes.
2. **0.2 — Usable evidence:** Markdown summary, improved schema errors, artifact manifest, reproducibility metadata, and integration examples. Implemented in this milestone.
3. **0.3 — Browser behavior:** first-class Playwright adapter with screenshots and browser diagnostics. Implemented in this milestone.
4. **0.4 — CI and hardening:** GitHub Action, configurable isolation backends, secret redaction, and operational limits.
5. **1.0 — Stable public contract:** versioned schema guarantees, documented adapters, compatibility policy, and published package.

## Success measures

- Every report names the exact revision and verification contract.
- Every criterion has an explicit status and evidence or a reason evidence is missing.
- A report is reproducible against the same revision and configuration.
- The same core engine works locally and in CI without a particular coding agent.
- Setup and infrastructure failures never become passing results.

## Product risks and decisions

- A Git worktree isolates the revision, not process privileges. Running repository scripts requires trust or a real sandbox.
- Check strength varies. A passing unit test is evidence only for what it tests; reports must not overclaim end-to-end behavior.
- Keep the core check contract small and extensible instead of binding the product to one test framework or agent.
- Resolve npm package ownership and repository URL before the first public release.
