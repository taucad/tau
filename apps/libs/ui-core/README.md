# @taucad/ui-core

The core of the Tau UI app that reads no app state: utilities, constants, typed helpers, the XState helpers every app machine uses, the import staging machines, and the agent-host placement, evidence and system-skills workers. Private and source-consumed (`scope:ui type:app-lib layer:data-access`): `apps/ui` and the UI feature libraries import it; it imports only app-libs of its layer or below and packages, never `apps/ui`.

Cut from `apps/ui/app/{lib,utils,constants,types,services,workers}` in UI wave E (CI decomposition blueprint, Part 3 P2 row E). It is the leaf the wave D feature libraries (`files-ui`, `editor`, `revisions-ui`, `publish`, `billing-ui`) build on, so it was cut before them.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` and the UI feature libraries cut from it.

| Subpath               | Contents                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./lib/<name>`        | `xstate.lib` (`fromSafeAsync`, `eventSchemas`, `MachineActors`), device id, memory and module-preload helpers, project-open timing, LSP completion, GeoSpec candidates, guards |
| `./utils/<name>`      | String, number, date, temporal, colour, crypto, binary, URL, backoff, file-reader, zip-download, search-parameter codecs, parameter config, auth plugins                       |
| `./constants/<name>`  | Cookie, cache, colour, editor, sidebar, search-parameter, health and workspace-copy constants; project names and prompt examples                                               |
| `./types/<name>`      | Editor and project-creation-location types                                                                                                                                     |
| `./services/<name>`   | Parameter-set service, filesystem source identity, headless-capture presentation                                                                                               |
| `./machines/<name>`   | `import-staging`, `import-linked`                                                                                                                                              |
| `./workers/<name>`    | Agent-host placement and evidence, system-skills overlay                                                                                                                       |
| `./filesystem/<name>` | `workspace-errors`                                                                                                                                                             |
| Test helpers          | `lib/xstate-test.utils`, `lib/project.fixture`, `lib/composed-view-client.fixture`, `lib/testing/worker-stub`, `workers/test/rooted-provider.fixture` (app suites only)        |

## Tests

Suites run under `environment: node`. The two that render (`lib/lsp-completion-apply`, `services/parameter-set-service`) opt into jsdom with a `@vitest-environment jsdom` docblock.

## Still in the app

Modules that read `#environment.config`, `lib/auth-client`, `import.meta.env`, the build-time globals in `apps/ui/vite-environment.d.ts`, or `#package.json`; modules that `apps/ui/vite.config.ts`, `server.ts`, `react-router.config.ts`, scripts or workflows name by path (`build-target`, `observability-harness-*`, `browser-stubs`, `certificates`, `static-paths`, `server-args`, `measurement-exact.*`, `kernel-libraries`, `project.constants`, `*.server.ts`); policy tests that scan `apps/ui/app`; and modules that import a `type:example` project (`builtin-projects`, `project-examples`, `warehouse-parts`).

Part of the [Tau](https://github.com/taucad/tau) monorepo.
