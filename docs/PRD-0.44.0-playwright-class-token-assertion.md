# PRD 0.44.0 — Playwright class-token assertion

## Problem

Browser checks cannot assert a CSS class as a token. Substring checks against the `class` attribute can incorrectly accept a longer, different class name.

## Product change

Add an `expectClass` step with a CSS `selector`, one `className` token, and boolean `present`. Use `classList.contains()` to poll for token presence or absence until the existing step timeout expires.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Accept only a non-empty class token up to 256 characters with no whitespace.
- Require a boolean `present` and reject class assertion fields on other actions.
- Treat failed evaluations or detached elements as non-matches; keep polling bounded.
- Do not record class tokens or DOM content in assertion failures.
- Preserve selector scoping and commit binding.

## Acceptance criteria

- Test exact token matching, absence, and selector/config validation.
- Confirm `is-active-old` does not satisfy the `is-active` token assertion.
- Update runtime/schema, browser example, README, changelog, roadmap, and packaged PRD.

## Adversarial review

- Confirm `classList.contains` avoids substring matches.
- Confirm failed evaluations do not pass either expected state and time out within the existing bound.
- Confirm error output excludes the configured class token and observed class list.
- Confirm extra fields and malformed class tokens are rejected.

Review outcome: runtime uses `classList.contains()` and a strict boolean comparison, so longer tokens cannot match. Evaluation errors become a non-match and retry only until the existing timeout. Config requires exactly the action's selector, class token, and presence flag; the runtime and JSON Schema reject malformed and action-inappropriate fields. Failure messages do not include the token or class list.
