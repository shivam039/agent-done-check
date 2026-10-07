# PRD 0.35.0 — Exact HTTP body text assertions

## Problem

HTTP checks can search for a substring or compare JSON values and raw-byte digests. They cannot assert that a bounded UTF-8 response body exactly equals known text.

## Product change

Add HTTP-only `bodyEquals`, a string up to 1,048,576 characters. Empty text is valid. Compare it to the complete decoded response body.

## Contract and safety

- Run the assertion only after exact commit binding, configured response status/header checks, and bounded body reading.
- Invalid UTF-8 and over-limit bodies remain unverified. A complete mismatch fails.
- Record nullable boolean `bodyEqualsMatched`; never record the expected or observed body text.
- Keep config version 1 and report schema version 4.

## Acceptance criteria

- Tests cover exact match, mismatch, empty body, invalid UTF-8, oversized body, and unbound response.
- Validation rejects invalid types, values over the size limit, and use on non-HTTP checks.
- Existing substring, digest, and JSON Pointer assertions continue to work.
- README, HTTP example, schemas, changelog, roadmap, and packaged PRD document the option.

## Adversarial review

Verify assertion evaluation occurs only after commit binding and body-size checks; ensure every skipped path leaves evidence null; check response text and expected values stay out of JSON, Markdown, SARIF, JUnit, and evidence artifacts.

Review outcome: the new evidence remains null on invalid UTF-8, oversized and unbound responses; matching and mismatching responses expose only the boolean. The existing body-read gate and raw-byte digest behavior remain intact.
