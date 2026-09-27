# PRD: Agent Done Check 0.18.0 — Per-check command environment

**Status:** Complete  
**Target:** 0.18.0

## Summary

Allow command checks to set local environment values without changing the environment seen by other checks.

## Goals and acceptance criteria

- Add optional command-only `env`, an object mapping valid environment variable names to string values.
- Merge allowlisted host baseline, global config `env`, then check `env`; the last layer overrides earlier values for that command only.
- Do not broaden which host variables are inherited. `inheritEnv` remains the only host-variable allowlist.
- Reject Git override and runner-controlled target marker variable names in check-level `env`; restore protected runner values after merging.
- Include per-check values of at least four characters in redaction when the variable name appears in `redactEnv`, matching existing exact-value masking rules.
- Test isolation, precedence, redaction, invalid inputs, reserved controls, and Windows environment name normalization.
- Adversarially review environment leakage, Git controls, platform key collisions, and browser setup isolation.

## Tracking issues

- [#41 Environment implementation](https://github.com/shivam039/agent-done-check/issues/41)
- [#42 Documentation](https://github.com/shivam039/agent-done-check/issues/42)
- [#43 Tests](https://github.com/shivam039/agent-done-check/issues/43)
- [#44 Adversarial review](https://github.com/shivam039/agent-done-check/issues/44)

## Rollout

Push 0.18.0 to `main`. Do not publish the package or create a release tag.
