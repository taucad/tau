# @taucad/settings-ui

The settings feature of the Tau UI app: the settings catalogue and its search, the settings layout primitives, the browser storage status row, the settings copy and the viewer settings' analytics person properties, the settings modules that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/settings` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app. Billing settings stay out: they belong to the billing library.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (Settings → Agents and Settings → Viewer, and the onboarding setup steps that reuse their copy and person properties).

| Subpath                                                 | Contents                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/settings/settings-section`                | `settingsSectionSchema` and `SettingsSection`: the sections the dialog can show, the single source of truth for `?settings=`                         |
| `./components/settings/settings-catalogue`              | The ungated catalogue (`createSettingsCatalogue`, with the host's Experimental flags and their copy passed in), `SettingId` and `searchSettings`     |
| `./components/settings/settings-item`                   | `SettingsItem`, `SettingsRow`, `SettingsGroup`, `SettingsInfo` and the loading skeletons; `SettingsSectionsProvider` takes the host's gated sections |
| `./components/settings/browser-storage-status`          | `BrowserStorageStatus`: the Settings → Filesystem row that says how well the browser protects local files from automatic cleanup                     |
| `./components/settings/setup-answers-copy`              | Copy of the setup-answers switch and row in Settings → Agents                                                                                        |
| `./components/settings/viewer/viewer-settings-copy`     | Settings → Viewer copy as data: mouse presets, orbit and gizmo styles, view-default rows                                                             |
| `./components/settings/viewer/viewer-person-properties` | Analytics person property names and `setViewerPersonProperties`; the host passes its analytics in as an argument                                     |

## Still in the app

- `settings-registry.ts` keeps the deployment gates: the Experimental rows from the app's feature flags (`flags/flag.constants`), the Tau Cloud gate (`cloud/cloud-enabled`), the desktop gate (`lib/build-target`), the build-time flag defaults and the runtime flags (`flags/use-feature`). `deployment-settings-provider.tsx` hands its gated sections to `SettingsSectionsProvider`.
- `hooks/use-settings-dialog.ts`: `tauCloudBuildEnabled` and React Router search parameters.
- Every other settings component reads app state (`#hooks/*`, `#lib/*`, `#cloud/*`, `#flags/*`, `#preferences/*`, `#telemetry/*`, `#routes/*`, `#runtime/*`) or renders one that does.
- `machine-details.tsx`, its fixture and test need `components/print/machine-facts` and the print test fixtures. They move with the print domain.
- `model-settings.tsx`: `hooks/use-models`.
- `billing-settings.tsx`: billing, which gets its own library.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
