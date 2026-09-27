# PRD: Agent Done Check 0.10.0 — SARIF export

**Status:** Approved for implementation  
**Target:** 0.10.0

## Summary

Add optional SARIF 2.1.0 output so CI systems that ingest SARIF can display failed or unverified acceptance checks alongside other code-scanning results.

## Goals and acceptance criteria

- `--sarif-output <file>` writes a SARIF 2.1.0 log; without this option, current outputs are unchanged.
- Include one SARIF result per failed or unverified check; omit passed checks.
- Use each check ID as a stable rule ID. Map failed to `error` and unverified to `warning`.
- Result messages contain only the check ID and status. Do not copy captured stdout/stderr, HTTP response bodies, secrets, or arbitrary check errors into SARIF.
- Record target commit and run ID in SARIF run properties, and include the SARIF file's path, hash, size, and media type in the evidence manifest.
- Ensure SARIF destination is distinct from config, JSON report, Markdown report, and manifest destinations.
- Test the required SARIF 2.1.0 structure and output mapping. No runtime dependencies are added.

## Non-goals

- Producing source-code locations when checks do not identify one, uploading results, or changing check outcome semantics.
- npm publication or release tagging.

## Format reference

The log follows the OASIS [SARIF 2.1.0 specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html) and its [official JSON schema](https://github.com/oasis-tcs/sarif-spec/blob/main/sarif-2.1/schema/sarif-schema-2.1.0.json).

## Tracking issues

- [#16 SARIF export](https://github.com/shivam039/agent-done-check/issues/16)
- [#17 Documentation and CI example](https://github.com/shivam039/agent-done-check/issues/17)
- [#18 SARIF tests](https://github.com/shivam039/agent-done-check/issues/18)

## Rollout

Prepare 0.10.0 for `main`. Do not publish the package or create a release tag.
