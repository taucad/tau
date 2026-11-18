# @taucad/publish-ui

The publish feature of the Tau UI app: the publication access panel (shared link, general access, per-email grants) and the recipient-email field, the viewer side of a publication (record parsing, lock and password screens, the paused-model gate and the view ping), and the archive and disk import machines. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/publish` in UI wave D (CI decomposition blueprint, Part 3 P2 row D); slice 2 moved the `components/share` viewer leaves and the `zip`, `unzip` and `import-disk` machines. It grows as the modules it waits on leave the app.

`@taucad/share` is not extended for this. It is the React-free sharing data layer (`scope:shared layer:data-access`: providers, locators, snapshots and artifacts), and `apps/api` consumes it, so React components there would put React and `@taucad/ui` into an API dependency.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the project share panel, the `/s/$slug` publication routes and the import route).

| Subpath                                         | Contents                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `./components/publish/publication-access-panel` | `PublicationAccessPanel` and `PublicationAccessGrant`: shared link, general access, grants    |
| `./components/publish/publication-email-tags`   | `PublicationEmailTagsField` and `getPublicationEmailTagsError` (recipient email validation)   |
| `./components/share/parsed-publication`         | `parsePublicationRecord`, `ParsedPublication` and `publicationFileFetchInit`                  |
| `./components/share/paused-model-gate`          | `PausedModelGate` and its copy; the app hands in its kill-memory state                        |
| `./components/share/publication-lock-screen`    | `PublicationLockScreen` (auth links injected), lock reasons and `parsePublicationLockPayload` |
| `./components/share/shared-project-password`    | `SharedProjectPassword`, the password form of a protected publication                         |
| `./components/share/use-view-ping`              | `useViewPing`, the publication view counter ping                                              |
| `./machines/import-disk.machine`                | `importDiskMachine`; the route injects the planner and the main-file picker                   |
| `./machines/unzip.machine`                      | `unzipMachine`                                                                                |
| `./machines/zip.machine`                        | `zipMachine`                                                                                  |

## Still in the app

- `components/publish/project-share-panel` (and its test): it reads `#environment.config`, `lib/share-providers`, `lib/build-target`, `use-settings-dialog`, `use-cookie`, `use-auth-links`, `use-revision-status`, `cloud/commercial-features` and `components/share/github-gist-management`.
- `hooks/use-publish-cloud-project-preview` (and its test): it reads `#environment.config`, `lib/revision-actor` and `use-project-thumbnail`.
- `components/share/publication-lock-screen`: a thin wrapper that binds the app's `useAuthLinks` to the library's lock screen.
- `components/share/tau-publication`: it reads `#environment.config`, the auth client and the file manager.
- `components/share/shared-project-workbench`: it reads `#environment.config`, the project and file-manager hooks, `lib/build-target` and the kill-memory modules.
- `components/share/publication-topbar`, `preview-workbench-layout` and `fork-action`: they reach the project route's export action and dockviews, `lib/build-target` and the project-library commands.
- `components/share/github-gist-management`: it reads `lib/share-providers`, `use-settings-dialog` and `use-auth-links`.
- `machines/import-github.machine`: it reads `lib/github-api`, which reads `#environment.config` and `meta.constants`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
