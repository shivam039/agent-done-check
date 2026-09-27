# PRD: Agent Done Check 0.17.0 — Select checks for a focused run

**Status:** Complete  
**Target:** 0.17.0

## Summary

Allow users to rerun one or more configured checks by ID while keeping partial results clearly distinct from a full-suite pass.

## Goals and acceptance criteria

- Accept repeatable `--check <id>` options for an audit. Run selected checks in config order.
- Reject unknown check IDs and reject selection combined with `--validate` or `--verify-bundle` before creating worktrees.
- Uncovered criteria remain `unverified`; selected checks cannot imply that omitted checks passed.
- Record the selection in JSON, Markdown, SARIF, and JUnit output. Explicitly show omitted check IDs; SARIF emits warning results and JUnit adds skipped testcases for them. Omitted selection means the full configured suite.
- Preserve default full-suite execution. Add help and README documentation.
- Correct `docs/compatibility.md` to identify report schema v4 as current and update report history.
- Adversarially review partial-run status precedence, unknown/duplicate IDs, output metadata, and schema compatibility; resolve findings before closing the review issue.

## Tracking issues

- [#37 Selection implementation](https://github.com/shivam039/agent-done-check/issues/37)
- [#38 Documentation and compatibility guide](https://github.com/shivam039/agent-done-check/issues/38)
- [#39 Selection tests](https://github.com/shivam039/agent-done-check/issues/39)
- [#40 Adversarial review](https://github.com/shivam039/agent-done-check/issues/40)

## Rollout

Push 0.17.0 to `main`. Do not publish the package or create a release tag.
