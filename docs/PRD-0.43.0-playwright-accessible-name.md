# PRD 0.43.0 — Playwright accessible-name assertions

## Problem

Browser checks need to verify the name presented to assistive technology for controls and other labeled elements, especially when accessible names are assembled from ARIA labels, alternative text, or visible text.

## Product change

Add `expectAccessibleName` with a CSS `selector`, supported ARIA `role`, and expected string `value`. Match a substring by default; set `exact: true` to require equality. Poll until the selected element matches the role and computed accessible name or the existing browser step timeout expires. Use Playwright's role/name locator so the browser accessibility implementation resolves `aria-labelledby`, labels, and other supported name sources.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Do not capture or emit observed names, page text, or input values in assertion failures.
- Treat failed attribute/text reads as non-matches and keep polling bounded.
- Preserve existing commit binding.

## Acceptance criteria

- Validate selector, string value, and optional boolean `exact`.
- Require a supported ARIA role and reject role fields on other actions.
- Test substring and exact name matching.
- Ensure failure messages do not include the expected or observed name.
- Update runtime/schema support, browser example, README, changelog, roadmap, and packaged PRD.

## Adversarial review

- Confirm a mismatched accessible name cannot pass in either exact or substring mode.
- Confirm attribute-read failures do not become a match and time out within the configured step bound.
- Confirm no accessible name, page text, or form value appears in failure output.
- Confirm Playwright computes the accessible name and the CSS selector scopes the matched role/name.

Review outcome: Playwright's `getByRole(role, { name, exact })` computes and matches the accessible name, and intersecting it with the configured CSS locator preserves selector scoping. Counts are retried until the existing step deadline; failures emit a fixed message without names. Role/action validation is strict, and commit binding/report shape are unchanged.
