# PRD 0.38.0 — Playwright document title assertions

## Problem

Browser checks cannot directly verify the document title, a common signal for page navigation and view readiness.

## Product change

Add an `expectTitle` step with a string `value`. The step polls `document.title` through Playwright's page API and matches a substring by default; `exact: true` requires equality.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Use the existing bounded check timeout and do not emit page content beyond existing error handling/redaction.
- The step does not require a selector.
- Require a string `value`; validate `exact` as a boolean when provided.

## Acceptance criteria

- Test substring and exact title matching and invalid/missing values.
- Update runtime and JSON Schema action lists, browser example, README, changelog, roadmap, and packaged PRD.
- Existing browser steps and commit binding continue to work.

## Adversarial review

- Confirm the title is re-read while polling and a stale/non-matching title cannot pass.
- Confirm exact mode does not accept a longer title containing the expected string.
- Confirm selector is not required and value is required in runtime and schema validation.
- Confirm timeout is inherited from the existing browser check and title diagnostics use established redaction.

Review outcome: title reads are polled until the check's bounded timeout, with unavailable reads treated as an empty title. The test fake verifies exact and substring matches. Runtime and schema both require a string value and allow selector omission for this action; the result flows through the standard report redaction path.
