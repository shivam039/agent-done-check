# PRD: Agent Done Check 0.30.0 — HTTP content type assertion

**Status:** Complete  
**Target:** 0.30.0

## Summary

Allow HTTP checks to require an expected response media type, compared case-insensitively after stripping optional parameters.

## Acceptance criteria

- Add HTTP-only `expectedContentType`, a valid bounded media type value.
- Evaluate only after exact commit binding and before consuming the body. Missing or mismatched content type fails and cancels the body.
- Record only `contentTypeMatched` boolean/null evidence. Never record observed or expected values.
- Keep existing body and header assertions compatible.
- Update schemas, docs, example, tests, and adversarially review normalization, privacy, and short-circuit behavior.

## Tracking issues

- [#97 Implementation](https://github.com/shivam039/agent-done-check/issues/97)
- [#98 Documentation](https://github.com/shivam039/agent-done-check/issues/98)
- [#99 Tests](https://github.com/shivam039/agent-done-check/issues/99)
- [#100 Adversarial review](https://github.com/shivam039/agent-done-check/issues/100)

## Adversarial review

- Confirmed parameterized mixed-case responses match a configured lowercase media type.
- Confirmed missing content type fails before consuming the streamed body.
- Confirmed unbound responses leave `contentTypeMatched` null.
- Confirmed expected media types reject parameters, malformed tokens, values over 256 characters, and non-HTTP usage.
- Confirmed reports contain only a boolean/null flag, not media type values.
- Found and fixed a short-circuit gap: non-expected HTTP statuses now cancel before body reads after content-type evidence is evaluated.
- Fixed strict schema placement after test compilation exposed an incorrectly nested property.

## Rollout

Merge 0.30.0 by GitHub PR after CI passes. No package publication or release tag.
