# PRD 0.33.0 — Per-check file byte limit

## Problem

File assertions currently have one fixed 1 MiB limit. A user who only needs to verify a small metadata file cannot lower the permitted read size for that check.

## Product change

Add file-only `maxFileBytes`, an integer from 1 through 1,048,576. Omission preserves the existing 1 MiB limit. The runner checks the committed Git blob's size before reading its bytes and reports the effective limit in `file.maxFileBytes`.

## Contract and safety

- The fixed 1 MiB limit remains the hard maximum.
- A blob larger than the configured limit is unverified, with its known size reported and no blob hash or content returned.
- Invalid values and use outside file checks are rejected before checks run.
- Keep config version 1 and report schema version 4; make the new report field optional in the schema so older reports remain valid.

## Acceptance criteria

- Tests cover default and configured limits, exact boundary behavior, oversized blobs, malformed limits, and non-file use.
- Oversized blobs are rejected based on Git's size metadata before blob bytes are read.
- README, file example, schemas, changelog, roadmap, and packaged PRD document the option.

## Adversarial review

Check every result construction path, including worktree/setup failures, for the effective cap; verify the hard cap remains enforced and the cap is checked before `cat-file blob`; confirm old report fixtures remain schema-valid.

Review outcome: all result paths include `maxFileBytes`, older report schemas remain valid because the new property is optional, and oversized test blobs have no hash evidence, confirming the runner stopped before reading blob bytes. The review also found that the report schema's file assertion enum omitted the already-supported JSON Pointer assertion names; those names are now included so schema validation matches actual reports.
