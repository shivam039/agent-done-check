# PRD 0.34.0 — Exact command output assertions

## Problem

Substring assertions can confirm that text appears, but cannot verify that a command emits exactly the expected stream.

## Product change

Add command-only `stdoutEquals` and `stderrEquals` strings, each up to 65,536 characters. Empty strings are valid. Compare against the complete captured text for the selected stream.

## Contract and safety

- An exact match passes; a mismatch on complete output fails.
- If the stream was truncated, report a null match and mark the check unverified, even when the retained suffix looks like the expected output.
- Report only nullable booleans; never include configured expected values in reports.
- Redact configured exact values from captured output and evidence using existing substring redaction behavior.
- Keep config v1 and report schema v4; do not add runtime dependencies.

## Acceptance criteria

- Tests cover exact stdout/stderr, empty output, mismatch, truncated suffix, value redaction, invalid value type/length, and use on non-command checks.
- Existing substring behavior and failure precedence remain unchanged.
- README, config/report schemas, changelog, roadmap, and packaged PRD describe the feature.

## Adversarial review

Check that a truncated stream never reports a match, even when its suffix equals the expected text; verify expected values do not appear in JSON, Markdown, SARIF, JUnit, or evidence; confirm unconfigured assertions are not presented in Markdown.

Review outcome: truncated exact assertions produce null evidence and unverified status; configured values are added to redaction before evidence writes. Review also caught that absent exact assertions must be omitted from the evidence object so a truncated substring check does not appear to have an exact assertion; the renderer now checks field presence.
