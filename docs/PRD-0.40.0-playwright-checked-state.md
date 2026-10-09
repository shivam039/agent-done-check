# PRD 0.40.0 — Playwright checked-state assertions

## Problem

Browser checks cannot currently assert whether a checkbox or radio option is selected.

## Product change

Add `expectChecked` and `expectUnchecked` steps with a CSS `selector`. Poll Playwright's `isChecked()` until the expected state is read or the browser check timeout expires.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Require selector-only steps; do not record input values or page content.
- Treat locator errors as non-matches and keep polling bounded.

## Acceptance criteria

- Test checked and unchecked behavior and schema validation.
- Update runtime action list, example, README, changelog, roadmap, and packaged PRD.
- Preserve commit binding and all other browser action behavior.

## Adversarial review

- Ensure `expectUnchecked` is not implemented as disabled-state and vice versa.
- Ensure opposite checked states cannot pass; locator errors remain pending.
- Confirm no value is required and a selector is required.

Review outcome: the actions use Playwright's `isChecked()` independently from `isEnabled()`. Boolean comparison is strict; rejected reads map to a non-match until the bounded deadline. Tests cover both directions and schema validation.
