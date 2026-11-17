# @taucad/settings-ui

The settings feature of the Tau UI app: the settings copy and the viewer settings' analytics person properties, the settings modules that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/settings` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app. Billing settings stay out: they belong to the billing library.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (Settings → Agents and Settings → Viewer, and the onboarding setup steps that reuse their copy and person properties).

| Subpath                                                 | Contents                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `./components/settings/setup-answers-copy`              | Copy of the setup-answers switch and row in Settings → Agents                                                    |
| `./components/settings/viewer/viewer-settings-copy`     | Settings → Viewer copy as data: mouse presets, orbit and gizmo styles, view-default rows                         |
| `./components/settings/viewer/viewer-person-properties` | Analytics person property names and `setViewerPersonProperties`; the host passes its analytics in as an argument |

## Still in the app

- `settings-registry.ts`, the catalogue for navigation and search, reads `tauCloudBuildEnabled` (through `cloud/cloud-enabled`), `lib/build-target`, the app's feature flags (`flags/flag.constants`, `flags/use-feature`) and `hooks/use-settings-dialog`. `settings-item.tsx` (the `SettingsGroup`, `SettingsRow` and `SettingsInfo` primitives) looks up each row's label in it, and every other settings component renders `settings-item`, so the whole dialog stays until the registry splits into a pure catalogue in this library and the gating that stays in the app.
- `hooks/use-settings-dialog.ts`: `tauCloudBuildEnabled` and the registry's `SettingId`.
- `machine-details.tsx`, its fixture and test qualify, but need `components/print/machine-facts` and the print test fixtures. They move with the print domain.
- `billing-settings.tsx`: billing, which gets its own library.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
