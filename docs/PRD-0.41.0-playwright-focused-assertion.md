# PRD 0.41.0 — Playwright focus assertion

## Problem

Browser checks cannot verify keyboard focus, which is an important part of sign-in, dialog, and keyboard-navigation flows.

## Product change

Add an `expectFocused` step with a CSS `selector`. Poll until the selected element is the document's active element or the browser check timeout expires.

## Contract and safety

- Keep config version 1 and report schema unchanged.
- Require only a selector; emit no DOM text or values.
- Treat detached elements or failed evaluations as non-matches.
- Preserve existing commit binding and bounded timeouts.

## Acceptance criteria

- Test a focused element and selector validation.
- Update runtime/schema action support, example, README, changelog, roadmap, and packaged PRD.
- Existing Playwright actions remain valid.

## Adversarial review

- Ensure another element having focus cannot satisfy the configured selector.
- Ensure an element that detaches during the check cannot pass.
- Confirm failed focus evaluations are retried only until the existing timeout.
- Confirm the assertion reports no text or form data.

Review outcome: the locator evaluation compares the selected element by identity with its owner document's active element. Evaluation errors are caught as `false`, then retried until timeout. The assertion emits only a fixed failure message and leaves commit binding unchanged.
