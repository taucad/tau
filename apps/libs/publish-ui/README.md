# @taucad/publish-ui

The publish feature of the Tau UI app: the publication access panel (shared link, general access, per-email grants) and the recipient-email field. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/publish` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It grows as the modules it waits on leave the app.

`@taucad/share` is not extended for this. It is the React-free sharing data layer (`scope:shared layer:data-access`: providers, locators, snapshots and artifacts), and `apps/api` consumes it, so React components there would put React and `@taucad/ui` into an API dependency.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the project share panel).

| Subpath                                         | Contents                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `./components/publish/publication-access-panel` | `PublicationAccessPanel` and `PublicationAccessGrant`: shared link, general access, grants  |
| `./components/publish/publication-email-tags`   | `PublicationEmailTagsField` and `getPublicationEmailTagsError` (recipient email validation) |

## Still in the app

- `components/publish/project-share-panel` (and its test): it reads `#environment.config`, `lib/share-providers`, `lib/build-target`, `use-settings-dialog`, `use-cookie`, `use-auth-links`, `use-revision-status`, `cloud/commercial-features` and `components/share/github-gist-management`.
- `hooks/use-publish-cloud-project-preview` (and its test): it reads `#environment.config`, `lib/revision-actor` and `use-project-thumbnail`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
