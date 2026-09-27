# PRD: Agent Done Check 0.16.0 — Command standard input

**Status:** Complete
**Target:** 0.16.0

## Summary

Allow command checks to consume a bounded text fixture through standard input.

## Goals and acceptance criteria

- Add optional command-only `stdin`, a string of at most 65,536 characters.
- Write the configured text to the process stdin and close the stream. Omission keeps the current empty-stdin/EOF behavior.
- Do not include the configured value as a report field. Captured stdout/stderr retain existing redaction and bounds; a command that echoes its input may still place it in captured output.
- Reject `stdin` on Playwright, file, and HTTP checks; enforce the bound before any command executes.
- Update the v1 schema and README; keep report schema and dependencies unchanged.
- Test consumption, omitted input, length/type validation, check type, and report structure.

## Tracking issues

- [#34 Stdin implementation](https://github.com/shivam039/agent-done-check/issues/34)
- [#35 Documentation](https://github.com/shivam039/agent-done-check/issues/35)
- [#36 Tests](https://github.com/shivam039/agent-done-check/issues/36)

## Rollout

Push 0.16.0 to `main`. Do not publish the package or create a release tag.
