# PRD 0.39.0 — Playwright enabled-state assertions

## Problem

Browser checks cannot directly verify whether a control is interactable, which is useful for submission and loading states.

## Product change

Add `expectEnabled` and `expectDisabled` steps with a CSS `selector`. Poll Playwright's `isEnabled()` until the requested boolean state is observed or the check timeout expires.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Require a selector and reject unnecessary values only where existing step validation already requires them.
- Treat locator read errors as non-matches and keep polling bounded.
- Keep current commit binding and report handling.

## Acceptance criteria

- Test enabled, disabled, and missing-selector validation.
- Update runtime/schema support, example, README, changelog, roadmap, and packaged PRD.
- Existing Playwright actions remain valid.

## Adversarial review

- Ensure the opposite control state cannot satisfy either action.
- Ensure detached or unreadable elements do not accidentally pass.
- Verify missing selectors fail validation, and no values or DOM content are required.

Review outcome: `isEnabled()` is compared to the requested boolean; thrown reads become non-matches and can only end through the bounded polling timeout. Tests exercise each polarity and schema validation requires the selector through the shared step rule.
