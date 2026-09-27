# PRD: Agent Done Check 0.31.0 — Normalized HTTP content-type evidence

**Status:** Complete  
**Target:** 0.31.0

## Summary

Include the normalized media type from a commit-bound HTTP response in report evidence, without parameters.

## Acceptance criteria

- Add `contentType` as nullable HTTP evidence; lowercase the type/subtype and strip parameters.
- Populate only after exact commit binding; missing type is null. Unbound responses keep it null.
- Bound values are limited to valid media type tokens; malformed values become null without exposing raw header content.
- Update report schema and ensure JSON, Markdown, SARIF, and JUnit outputs safely represent evidence.
- Update docs, tests, example, and adversarial review for privacy, malformed values, and rendering.

## Tracking issues

- [#102 Implementation](https://github.com/shivam039/agent-done-check/issues/102)
- [#103 Documentation](https://github.com/shivam039/agent-done-check/issues/103)
- [#104 Tests](https://github.com/shivam039/agent-done-check/issues/104)
- [#105 Adversarial review](https://github.com/shivam039/agent-done-check/issues/105)

## Adversarial review

- Confirmed `contentType` remains null for missing and unbound response headers.
- Confirmed mixed-case valid media types normalize to lowercase and parameters are stripped, including a private parameter fixture.
- Confirmed media type validity/length is bounded by the schema and runtime parser; invalid values are never included as normalized evidence.
- Confirmed Markdown escapes the normalized value and does not include raw parameter data. JSON, SARIF, and JUnit inherit the sanitized report evidence.
- Confirmed existing `contentTypeMatched` remains null/boolean and works independently of the new evidence property.

## Rollout

Merge 0.31.0 by GitHub PR after CI passes. No package publication or release tag.
