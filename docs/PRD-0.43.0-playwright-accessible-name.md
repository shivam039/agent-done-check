# PRD 0.43.0 — Playwright accessible-name assertions

## Problem

Browser checks need to verify the name presented to assistive technology for controls and other labeled elements, especially when accessible names are assembled from ARIA labels, alternative text, or visible text.

## Product change

Add `expectAccessibleName` with a CSS `selector` and expected string `value`. Match a substring by default; set `exact: true` to require equality. Poll until the name matches or the existing browser step timeout expires. Resolve the name from `aria-label`, then `alt`, then Playwright-visible inner text.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Do not capture or emit observed names, page text, or input values in assertion failures.
- Treat failed attribute/text reads as non-matches and keep polling bounded.
- Preserve existing commit binding.

## Acceptance criteria

- Validate selector, string value, and optional boolean `exact`.
- Test substring and exact name matching.
- Ensure failure messages do not include the expected or observed name.
- Update runtime/schema support, browser example, README, changelog, roadmap, and packaged PRD.

## Adversarial review

- Confirm a mismatched accessible name cannot pass in either exact or substring mode.
- Confirm attribute-read failures do not become a match and time out within the configured step bound.
- Confirm no accessible name, page text, or form value appears in failure output.
- Confirm only supported name sources are consulted and selector scoping remains intact.

Review outcome: substring and exact matching both use the selected locator; `aria-label`, then `alt`, then inner text are tried, and read failures remain non-matches until timeout. Failure text is fixed and excludes expected and observed names. The selector and optional exact flag are validated, and commit binding/report shape are unchanged.
