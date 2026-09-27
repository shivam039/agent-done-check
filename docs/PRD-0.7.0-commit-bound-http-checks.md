# PRD: Agent Done Check 0.7.0 — Commit-bound HTTP checks

**Status:** Approved for implementation  
**Target:** 0.7.0

## Summary

Add a read-only HTTP check adapter for deployments that expose the commit they serve. The check sends one GET request, requires the response to bind to the requested full Git commit through a configured response header, applies an expected status and optional body substring assertion, and records bounded metadata and a body hash without recording the body.

## Problem

The 0.6 file adapter verifies committed source, but cannot determine whether a running deployment is serving that revision. Playwright can verify deployed behavior, but brings browser setup and scenario complexity. A small HTTP adapter can verify a deployment marker and health response without executing project code or installing a browser.

## Goals

- Add `type: "http"` with GET-only semantics and no user-supplied headers, credentials, request body, or redirects.
- Require the response to contain the exact requested full commit SHA in a configured response header (default `x-agent-done-check-commit`).
- Support an expected status (default 200) and optional UTF-8 body substring assertion.
- Bound response bodies at 1 MiB, apply request timeout, and capture only response status, sanitized URL, byte count, SHA-256, and assertion results.
- Treat an unavailable or unbound response as `unverified`; treat an assertion mismatch on a correctly bound response as `failed`.
- Keep config version 1 and the runtime dependency set unchanged; publish report schema v4 while retaining v2 and v3 schemas.

## Non-goals

- Authenticated requests, arbitrary headers, non-GET methods, redirects, cookies, or user-controlled request bodies.
- General HTTP functional testing, JSONPath, schema matching, response body capture, or retries.
- Supporting untrusted verification configs or claiming the adapter is a network sandbox.
- npm publication or release tagging.

## Contract and acceptance criteria

- HTTP config requires `url` and `criteria`; optional `commitHeader` defaults to `x-agent-done-check-commit`. `expectedStatus` is an integer from 100 through 599 and defaults to 200. Optional `bodyContains` is a string.
- URLs must be absolute HTTP(S) URLs without embedded credentials. Reports strip URL query and fragment values. Redirects are rejected.
- The adapter performs a GET with a bounded timeout and reads at most 1 MiB plus one byte to detect oversize responses.
- The full response commit header must exactly equal the requested commit SHA. A missing or mismatched header yields `unverified` and cannot pass.
- After a verified binding, a status mismatch or non-matching body substring yields `failed`; all configured assertions matching yields `passed`.
- A body substring assertion requires valid UTF-8. Oversized bodies, invalid UTF-8 when text matching is requested, request errors, or timeouts are `unverified`.
- Report schema v4 describes HTTP results. Config schema v1 is extended additively. Existing report schema versions remain unchanged and available.
- Tests cover binding, statuses, substring match/mismatch, timeouts, redirects, URL credential rejection, oversized/invalid bodies, redaction, and generated schema conformance using a local HTTP server.

## Risk and limits

This adapter makes outbound requests to URLs selected by the config. Configs remain executable policy and should be trusted. The adapter does not forward host environment secrets, does not follow redirects, and does not store response bodies, but it does not prevent requests to private or local network addresses. It is not an OS-level sandbox.

## Rollout

Merge as 0.7.0 preparation. Do not publish the package or create a release tag as part of this PRD.

## Tracking issues

- [#7 Implement the GET-only HTTP check adapter](https://github.com/shivam039/agent-done-check/issues/7)
- [#8 Version and document the HTTP adapter contract](https://github.com/shivam039/agent-done-check/issues/8)
- [#9 Add HTTP adapter tests and schema conformance](https://github.com/shivam039/agent-done-check/issues/9)
