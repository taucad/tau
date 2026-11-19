# @taucad/publish-ui

The publish feature of the Tau UI app: the project share panel (direct link, GitHub Gist and cloud link) with the publication access panel (shared link, general access, per-email grants) and the recipient-email field, the viewer side of a publication (the cloud link loader, metadata and route surfaces, record parsing, lock and password screens, the paused-model gate and the view ping), the archive, disk and GitHub import machines, and GitHub address parsing. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/publish` and `components/share`. What reads app state stays in the app and arrives by injection: the GitHub client as a machine input, the session user, project thumbnail and API base as hook inputs, and the app's sharing, revision, plan, auth and workbench services through the Gist, project share and publication viewer services providers. It grows as the modules it waits on leave the app.

`@taucad/share` is not extended for this. It is the React-free sharing data layer (`scope:shared layer:data-access`: providers, locators, snapshots and artifacts), and `apps/api` consumes it, so React components there would put React and `@taucad/ui` into an API dependency.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the project share panel, the `/s/$slug` publication routes and the import route).

| Subpath                                          | Contents                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `./components/publish/project-share-panel`       | `ProjectSharePanel`, `useProjectShareSource`, `ShareMethod` and `missingModelFileMessage`      |
| `./components/publish/project-share-services`    | `ProjectShareServicesProvider` and its structural `ProjectShareServices`, bound by the app     |
| `./components/publish/publication-access-panel`  | `PublicationAccessPanel` and `PublicationAccessGrant`: shared link, general access, grants     |
| `./components/publish/publication-email-tags`    | `PublicationEmailTagsField` and `getPublicationEmailTagsError` (recipient email validation)    |
| `./components/publish/share-envelope-state`      | `shareEnvelopeFailureOf`, the cloud state a failed share envelope read says                    |
| `./components/share/github-gist-management`      | `GithubGistManagement`, the owner's republish, unpublish and reconnect controls for a Gist     |
| `./components/share/github-gist-services`        | `GithubGistServicesProvider` and its structural `GithubGistServices`, bound by the app         |
| `./components/share/parsed-publication`          | `parsePublicationRecord`, `ParsedPublication` and `publicationFileFetchInit`                   |
| `./components/share/paused-model-gate`           | `PausedModelGate` and its copy; the app hands in its kill-memory state                         |
| `./components/share/publication-lock-screen`     | `PublicationLockScreen` (auth links injected), lock reasons and `parsePublicationLockPayload`  |
| `./components/share/publication-viewer-services` | `PublicationViewerServicesProvider` and its structural `PublicationViewerServices`             |
| `./components/share/shared-project-password`     | `SharedProjectPassword`, the password form of a protected publication                          |
| `./components/share/tau-publication`             | `createPublicationLoader` (API base injected), `publicationMeta` and the viewer route surfaces |
| `./components/share/use-view-ping`               | `useViewPing`, the publication view counter ping                                               |
| `./hooks/use-publish-cloud-project-preview`      | `usePublishCloudProjectPreview` and `publishCloudProjectPreview`: the saved catalog preview    |
| `./lib/github-url`                               | `parseGitHubUrl` and `normalizeRepositoryFolder`, the import's repository address parsing      |
| `./machines/import-disk.machine`                 | `importDiskMachine`; the route injects the planner and the main-file picker                    |
| `./machines/import-github.machine`               | `importGitHubMachine`; the route injects the GitHub client (`githubClient` input)              |
| `./machines/unzip.machine`                       | `unzipMachine`                                                                                 |
| `./machines/zip.machine`                         | `zipMachine`                                                                                   |

## Still in the app

- `components/publish/project-share-panel`: the app's binding of `ProjectShareServices` (the API base from `#environment.config`, the `lib/share-providers` registry, the share-method cookie, the revision hooks and `cloud/commercial-features`) around the library's panel. `project-share-action`'s suite mocks this path.
- `hooks/use-publish-cloud-project-preview`: the app's binding of the saved-preview producer (the API base from `#environment.config`, `use-project-thumbnail` and the revision session user). Five route and machine suites mock this path.
- `components/share/publication-lock-screen`: a thin wrapper that binds the app's `useAuthLinks` to the library's lock screen. Its one caller, the desktop `s.$slug` route, mounts no `PublicationViewerServicesProvider`.
- `components/share/tau-publication`: the app's binding of `PublicationViewerServices` (the lazy shared-project workbench, `SharedWorkerGate`, the error page, `useAuthLinks` and the auth client's session) and of the loader's API base from `#environment.config`. Three `s.$slug` suites mock this path.
- `components/share/shared-project-workbench`: it reads `#environment.config`, the project and file-manager hooks, `lib/build-target` and the kill-memory modules.
- `components/share/publication-topbar`, `preview-workbench-layout` and `fork-action`: they reach the project route's export action and dockviews, `lib/build-target` and the project-library commands.
- `components/share/github-gist-services`: the app's binding of `GithubGistServices` — six `lib/share-providers` functions (connection status, connect, await, the authorization-return parser, the provider registry and its browser context) and the `useAuthLinks` and `useSettingsDialog` hooks.
- `lib/share-providers` (and its tests): it reads `#environment.config`, the auth client, `lib/build-target` and `lib/share-origin` (the request id now comes from `@taucad/ui-core/lib/api-request-id`). Its pure Gist return-URL helpers (`parseGithubGistAuthorizationReturn`, `createGithubGistAuthorizationReturnUrl`) stay with it: three other app modules and its own suite import them, and the injected parser keeps this cut to the component.
- `lib/github-api` (and its test): the concrete GitHub client. It reads `#environment.config` (the API base) and `meta.constants` (the user agent), and the route passes it into `import-github.machine`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
