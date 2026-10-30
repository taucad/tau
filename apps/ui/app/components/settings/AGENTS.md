# Settings UI

This subtree renders the settings dialog. `settings-registry.ts` is the catalogue for navigation and search; `settings-item.tsx` owns the `SettingsGroup`, `SettingsRow` and `SettingsInfo` layout primitives.

- Give every setting one registry entry and one `SettingsRow` with that `settingId`, worded the same in both.
- Keep each topic in the one section that owns it, short sentence-case copy, and detail behind `info`.

Follow [Settings Policy](../../../../../docs/policy/settings-policy.md).
