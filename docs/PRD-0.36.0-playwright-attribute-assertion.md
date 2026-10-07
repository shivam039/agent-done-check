# PRD 0.36.0 — Playwright attribute assertions

## Problem

Browser acceptance checks can inspect visibility, text, form values, and URLs, but cannot directly verify accessible labels or application state stored in DOM attributes.

## Product change

Add a Playwright `expectAttribute` step with a CSS `selector`, non-empty `attribute` name (up to 256 characters), and expected string `value`. The check polls until the attribute exists and contains the expected value. Set `exact: true` to require equality. Missing attributes remain pending until the step timeout.

## Contract and safety

- Keep configuration version 1 and the report schema unchanged.
- Do not report observed or expected attribute values in failure output; configured step values are redacted.
- Continue to run steps only as part of the existing commit-bound Playwright check.
- Reject missing/blank/overlong attribute names and reject `attribute` on other actions in runtime validation.

## Acceptance criteria

- Cover substring and exact matches, absent attributes, and malformed configuration.
- Include the action in the JSON Schema, example, README, changelog, roadmap, and packaged PRD.
- Existing Playwright behavior and commit-binding requirements continue to work.

## Adversarial review

- Confirm a missing attribute cannot pass and is bounded by the step timeout.
- Confirm exact mode does not accept a substring and default mode does not require equality.
- Confirm expected and observed attribute values do not appear in JSON, Markdown, or other report outputs on failure.
- Check the runtime validator and schema agree about required fields and attribute length.

Review outcome: attribute reads use Playwright's locator API and poll only until the bounded step deadline. A `null` result never passes. The failure text is passed through the existing configured-value redaction before report serialization, while JSON Schema and runtime validation enforce a non-empty attribute name capped at 256 characters and require the expected value.
