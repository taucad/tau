# Settings UI

This subtree renders the settings dialog. The catalogue for navigation and search and the `SettingsGroup`, `SettingsRow` and `SettingsInfo` layout primitives live in `@taucad/settings-ui`; `settings-registry.ts` gates the catalogue for this deployment (Tau Cloud, desktop, feature flags) and `DeploymentSettingsProvider` hands the gated sections to the rows.

- Give every setting one catalogue entry and one `SettingsRow` with that `settingId`, worded the same in both.
- Keep each topic in the one section that owns it, short sentence-case copy, and detail behind `info`.

Follow [Settings Policy](../../../../../docs/policy/settings-policy.md).
