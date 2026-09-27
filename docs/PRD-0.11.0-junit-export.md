# PRD: Agent Done Check 0.11.0 — JUnit XML export

**Status:** Approved for implementation  
**Target:** 0.11.0

## Summary

Add an optional JUnit-compatible XML report with one testcase per configured check, allowing CI systems to display acceptance check outcomes in their test report UI.

## Goals and acceptance criteria

- `--junit-output <file>` writes an XML test suite; without the option, existing outputs remain unchanged.
- Emit one testcase per configured check. Passed checks have no outcome child element; failed checks use `<failure>`; unverified checks use `<skipped>`.
- Include overall run ID and target commit as suite properties, and include check duration in seconds.
- Escape XML text and attribute values correctly.
- Never include captured stdout/stderr, HTTP response bodies, secrets, or arbitrary error messages.
- Ensure the JUnit destination is distinct from config, JSON, Markdown, SARIF, and manifest destinations.
- Add the XML file's path, byte size, hash, and media type to the evidence manifest.
- No runtime dependencies are added.

## Non-goals

- Defining a new test outcome model or changing process exit codes.
- npm publication or release tagging.

## Tracking issues

- [#19 JUnit XML export](https://github.com/shivam039/agent-done-check/issues/19)
- [#20 Documentation and CI usage](https://github.com/shivam039/agent-done-check/issues/20)
- [#21 JUnit mapping tests](https://github.com/shivam039/agent-done-check/issues/21)

## Rollout

Prepare 0.11.0 for `main`. Do not publish the package or create a release tag.
