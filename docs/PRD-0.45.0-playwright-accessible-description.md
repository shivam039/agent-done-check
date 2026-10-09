# PRD 0.45.0 — Playwright accessible-description assertion

## Problem

Browser checks can verify an element's accessible name, but cannot assert its accessible description, which often conveys help, error, or supplementary instructions to assistive technology.

## Product change

Add `expectAccessibleDescription` with a CSS `selector`, supported ARIA `role`, and expected string `value`. Match a substring by default; set `exact: true` for equality. Use Playwright's computed role/description matching, scoped to the selected CSS locator. This action requires Playwright 1.60 or newer.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Require selector, role, and string value; allow only optional boolean `exact` beyond those fields.
- Treat failed locator reads as non-matches and keep polling bounded by the existing step timeout.
- Do not capture or emit expected or observed descriptions in failures.
- Preserve commit binding.

## Acceptance criteria

- Test exact and substring accessible-description matching with a scoped role.
- Validate required selector/role/value, supported role values, and optional boolean `exact`.
- Confirm failure output does not include expected or observed descriptions.
- Update runtime/schema, browser example, README, changelog, roadmap, and packaged PRD.

## Adversarial review

- Confirm description matching uses Playwright's computed accessibility data rather than DOM attribute substring checks.
- Confirm another element outside the CSS selector cannot satisfy the assertion.
- Confirm mismatches and rejected reads remain non-matches until timeout.
- Confirm expected or observed descriptions and form values are absent from failure output.

Review outcome: runtime delegates description computation and match behavior to Playwright's `getByRole(role, { description, exact })`, then intersects with the configured CSS locator to enforce scope. Count errors are retried only until the configured timeout. Validation requires a supported role, selector, and string value; fixed failures include no expected/observed description or form value. The action documents its Playwright 1.60 minimum; commit binding remains unchanged.
