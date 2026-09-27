# PRD: Agent Done Check 0.13.0 — Command output assertions

**Status:** Complete
**Target:** 0.13.0

## Summary

Add optional stdout and stderr substring assertions to command checks, with explicit handling for the runner's bounded output capture.

## Goals and acceptance criteria

- Command checks accept optional non-empty `stdoutContains` and `stderrContains` strings, each at most 4096 characters.
- Evaluate assertions against captured output before report redaction. Redact configured substring values from captured stdout/stderr in JSON and evidence files; never include them in Markdown, SARIF, or JUnit output.
- Report only nullable/matched boolean assertion evidence.
- If a requested substring is found in captured output, that assertion matches, even if older output bytes were truncated.
- If absent from complete output, the assertion fails. If absent from truncated output, the check is `unverified` because the runner cannot establish absence.
- A failed complete-output assertion fails the check even if another output assertion is unverified; expected-exit-code mismatch and timeouts retain their existing precedence/semantics.
- Reject these options on Playwright, file, and HTTP checks.
- Keep report schema version and runtime dependencies unchanged.

## Tracking issues

- [#25 Output assertion behavior](https://github.com/shivam039/agent-done-check/issues/25)
- [#26 Documentation and roadmap](https://github.com/shivam039/agent-done-check/issues/26)
- [#27 Output assertion tests](https://github.com/shivam039/agent-done-check/issues/27)

## Rollout

Prepare 0.13.0 for `main`. Do not publish the package or create a release tag.
