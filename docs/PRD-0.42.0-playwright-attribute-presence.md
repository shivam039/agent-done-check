# PRD 0.42.0 — Playwright attribute presence assertions

## Problem

Browser checks can compare an attribute value, but cannot assert that a boolean or accessibility attribute is present without supplying its value. They also cannot express that an attribute must be absent without relying on element visibility or count.

## Product change

Add `expectAttributeExists` and `expectAttributeMissing` steps. Both require a CSS `selector` and a non-empty `attribute` name up to 256 characters. Poll the selected element's attribute until it is present or absent, respectively, or the step timeout expires. An empty-valued attribute counts as present.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Do not accept `value` or `exact` for these actions.
- Treat detached-element and attribute-read errors as non-matches and keep polling bounded.
- Record no attribute values or DOM content; failures identify only the configured attribute name and expected presence state.
- Preserve existing commit binding and browser diagnostics behavior.

## Acceptance criteria

- Validate required selectors and attribute names, reject malformed/overlong names and action-inappropriate fields.
- Test a present attribute with an empty string value and a missing attribute.
- Update runtime and JSON schema action support, browser example, README, changelog, roadmap, and packaged PRD.
- Existing browser actions remain valid.

## Adversarial review

- Confirm empty-string values are treated as present, while `null` is absent.
- Confirm `expectAttributeMissing` cannot pass for an empty-valued but present attribute.
- Confirm rejected reads and detached locators stay pending until timeout.
- Confirm failure diagnostics do not include attribute values, page text, or input values.

Review outcome: empty-valued attributes remain present because Playwright returns an empty string rather than null; read errors map to null and retry until the existing timeout. Both actions require only selector and attribute, reject value/exact fields in runtime validation and JSON Schema, and produce fixed diagnostics without attribute values or page text. Commit binding remains unchanged.
