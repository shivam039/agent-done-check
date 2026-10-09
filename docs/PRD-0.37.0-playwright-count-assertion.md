# PRD 0.37.0 — Playwright element count assertions

## Problem

Browser checks can inspect a single element's state, but cannot assert that a repeated result set has an expected size or that a UI element is absent.

## Product change

Add an `expectCount` step with a CSS `selector` and non-negative integer `count` (capped at 1,000,000). Poll Playwright's locator count until it equals the target or the existing step timeout expires. Count zero is valid.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Record no DOM content; failure output contains only expected and last observed counts.
- Continue to run the step only in the existing commit-bound Playwright scenario.
- Reject missing, fractional, negative, over-limit, or action-inappropriate count fields.

## Acceptance criteria

- Test exact count matching, zero count, and invalid configuration.
- Include action validation, schema, example, README, changelog, roadmap, and packaged PRD.
- Existing Playwright actions and commit binding continue to work.

## Adversarial review

- Confirm zero is not treated as missing or false.
- Confirm a selector that does not match cannot satisfy a positive count.
- Confirm polling exits at the configured step deadline, including when the locator count call rejects.
- Confirm schema and runtime validation agree on field requirements and bounds.

Review outcome: zero is explicitly accepted as an integer, the count call is retried only until the step timeout, and count errors are treated as no match. The schema and runtime validator both require an integer from zero through 1,000,000 only for `expectCount`; reports contain no page text.
