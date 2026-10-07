# PRD 0.32.0 — HTTP JSON Pointer existence assertions

## Problem

An HTTP health or deployment response can contain a required field whose value is dynamic or not known in advance. `bodyJsonPointerEquals` cannot express that the field merely needs to exist.

## Product change

Add `bodyJsonPointerExists: { "pointer": "..." }` to commit-bound HTTP checks. The pointer uses RFC 6901 semantics already used by file checks. A pointer that resolves to `null`, `false`, zero, or an empty string exists. The empty pointer selects the JSON document root.

## Contract and safety

- Evaluate only after exact commit binding, configured status and header assertions, body-size enforcement, UTF-8 decoding, and JSON parsing.
- A missing pointer fails. Invalid JSON fails. Invalid UTF-8, an oversized body, a timeout, or missing/mismatched commit binding remains unverified.
- Report only nullable boolean `bodyJsonPointerExistsMatched`; do not emit the pointer or response value.
- Keep report schema version 4 and config version 1.
- Reject malformed pointers and unsupported assertion properties during config validation.

## Acceptance criteria

- Tests cover root, escaped object keys, arrays, present null/false values, and a missing pointer.
- Tests cover invalid JSON, invalid UTF-8, body limit, unbound responses, and invalid configuration.
- README, HTTP example, config/report schemas, changelog, roadmap, and packaged documentation describe the feature.

## Adversarial review

Review the ordering so unbound responses never parse/assert body data; make sure `false` and `null` count as present; ensure no pointer or response value enters JSON, Markdown, SARIF, JUnit, or evidence output; and verify the report field stays null when the assertion did not run.

Review outcome: all listed cases are covered. The review found that combining equality and existence assertions would parse the same bounded JSON body twice; implementation now parses once and shares the document between assertions. Existing report fields and artifact outputs contain only match booleans.
